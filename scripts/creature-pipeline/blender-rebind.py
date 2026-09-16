import bpy
import json
import math
import os
import sys
from mathutils import Matrix, Vector

def parse_args():
    argv = sys.argv
    if '--' not in argv:
        return {}
    args = argv[argv.index('--') + 1:]
    parsed = {}
    i = 0
    while i < len(args):
        if args[i].startswith('--'):
            key = args[i][2:]
            if i + 1 < len(args) and not args[i + 1].startswith('--'):
                parsed[key] = args[i + 1]
                i += 2
            else:
                parsed[key] = True
                i += 1
        else:
            i += 1
    return parsed

def get_bbox(obj):
    if obj.type == 'MESH':
        coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
        min_v = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
        max_v = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
        return min_v, max_v
    if obj.type == 'ARMATURE':
        points = [obj.matrix_world @ b.head_local for b in obj.data.bones] + [obj.matrix_world @ b.tail_local for b in obj.data.bones]
        min_v = Vector((min(c.x for c in points), min(c.y for c in points), min(c.z for c in points)))
        max_v = Vector((max(c.x for c in points), max(c.y for c in points), max(c.z for c in points)))
        return min_v, max_v
    bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    min_v = Vector((min(c.x for c in bbox), min(c.y for c in bbox), min(c.z for c in bbox)))
    max_v = Vector((max(c.x for c in bbox), max(c.y for c in bbox), max(c.z for c in bbox)))
    return min_v, max_v

def distance_point_to_segment(point, seg_a, seg_b):
    ab = seg_b - seg_a
    ab_len_sq = ab.length_squared
    if ab_len_sq < 1e-8:
        return (point - seg_a).length
    t = max(0.0, min(1.0, (point - seg_a).dot(ab) / ab_len_sq))
    projection = seg_a + t * ab
    return (point - projection).length

def rebind(mesh_path, donor_path, out_glb_path, report_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. Import donor armature
    if not os.path.exists(donor_path):
        raise FileNotFoundError(f"Donor GLB not found: {donor_path}")
    bpy.ops.import_scene.gltf(filepath=donor_path)
    
    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break
    if not armature:
        raise RuntimeError("No armature in donor GLB.")

    # Remove any donor meshes
    for obj in list(bpy.data.objects):
        if obj.type == 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)

    # Rotate donor arm chains into standard canonical A-pose (45 deg down)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')

    def rotate_bone_hierarchy(eb_root, rot_mat, origin):
        def rec(eb):
            eb.head = origin + rot_mat @ (eb.head - origin)
            eb.tail = origin + rot_mat @ (eb.tail - origin)
            for c in eb.children:
                rec(c)
        rec(eb_root)

    if 'upperarm_l' in armature.data.edit_bones:
        eb_l = armature.data.edit_bones['upperarm_l']
        rotate_bone_hierarchy(eb_l, Matrix.Rotation(math.radians(45), 3, 'Y'), Vector(eb_l.head))

    if 'upperarm_r' in armature.data.edit_bones:
        eb_r = armature.data.edit_bones['upperarm_r']
        rotate_bone_hierarchy(eb_r, Matrix.Rotation(math.radians(-45), 3, 'Y'), Vector(eb_r.head))

    bpy.ops.object.mode_set(mode='OBJECT')

    # 2. Import target mesh
    if not os.path.exists(mesh_path):
        raise FileNotFoundError(f"Mesh GLB not found: {mesh_path}")
    bpy.ops.import_scene.gltf(filepath=mesh_path)

    mesh_objs = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    if not mesh_objs:
        raise RuntimeError("No mesh found in target GLB.")

    # Join multiple mesh objects if needed
    if len(mesh_objs) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in mesh_objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = mesh_objs[0]
        bpy.ops.object.join()
        target_mesh = mesh_objs[0]
    else:
        target_mesh = mesh_objs[0]

    # Clean target mesh transforms
    bpy.ops.object.select_all(action='DESELECT')
    target_mesh.select_set(True)
    bpy.context.view_layer.objects.active = target_mesh
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    target_mesh.vertex_groups.clear()

    # Rotate mesh -90 deg around Z to align Tripo coordinate convention
    # (+X forward, +Y left) with canonical humanoid UAL2 skeleton (-Y forward, +X left)
    rot = Matrix.Rotation(-math.pi / 2, 4, 'Z')
    target_mesh.data.transform(rot)
    target_mesh.data.update()

    # 3. Fit armature to mesh bounding box
    mesh_min, mesh_max = get_bbox(target_mesh)
    mesh_height = mesh_max.z - mesh_min.z
    mesh_center = (mesh_min + mesh_max) / 2.0

    arm_min, arm_max = get_bbox(armature)
    arm_height = arm_max.z - arm_min.z

    if arm_height > 1e-4:
        scale_factor = mesh_height / arm_height
        armature.scale = Vector((scale_factor, scale_factor, scale_factor))
        # Place armature base at mesh bottom and center X/Y
        armature.location.x = mesh_center.x
        armature.location.y = mesh_center.y
        armature.location.z = mesh_min.z - (arm_min.z * scale_factor)
        
        bpy.ops.object.select_all(action='DESELECT')
        armature.select_set(True)
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 4. Attempt automatic bone heat skinning
    bpy.ops.object.select_all(action='DESELECT')
    target_mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bone_heat_success = False
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        bone_heat_success = True
    except Exception as e:
        print(f"Bone heat parent_set warning: {e}")

    if target_mesh.parent != armature:
        target_mesh.parent = armature
    arm_mod = next((m for m in target_mesh.modifiers if m.type == 'ARMATURE'), None)
    if not arm_mod:
        arm_mod = target_mesh.modifiers.new(name='Armature', type='ARMATURE')
    arm_mod.object = armature
    arm_mod.use_vertex_groups = True

    # Ensure all armature bones have vertex groups
    bone_names = [b.name for b in armature.data.bones]
    for bname in bone_names:
        if bname not in target_mesh.vertex_groups:
            target_mesh.vertex_groups.new(name=bname)

    vg_indices = {vg.name: vg.index for vg in target_mesh.vertex_groups}

    # Define active deforming bones for fallback distance weighting
    # Exclude root motion bone, leaf tip bones (*_leaf_*), and finger phalanges
    # Hand mesh deforms with hand_l / hand_r; toes deform with ball_l / ball_r
    excluded_prefixes = ('thumb_', 'index_', 'middle_', 'ring_', 'pinky_')
    excluded_bones = {'root'}

    def is_deforming_bone(bname):
        if bname in excluded_bones or '_leaf_' in bname:
            return False
        if any(bname.startswith(p) for p in excluded_prefixes):
            return False
        return True

    # Get bone segments in world coordinates for active deforming bones
    bone_segments = {}
    for bone in armature.data.bones:
        if is_deforming_bone(bone.name):
            head_world = armature.matrix_world @ bone.head_local
            tail_world = armature.matrix_world @ bone.tail_local
            bone_segments[bone.name] = (head_world, tail_world)

    # 5. Check weights and fill unweighted / under-weighted vertices with distance fallback
    mesh_data = target_mesh.data
    verts = mesh_data.vertices
    unweighted_count = 0
    fallback_assigned = 0

    arm_bones = {'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'}
    leg_bones = {'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'}

    # Build vertex to groups lookup
    for v in verts:
        weights = [g.weight for g in v.groups if g.weight > 0.001]
        if not weights or sum(weights) < 0.01:
            unweighted_count += 1
            # Deterministic distance-to-bone weighting for unweighted vertices
            v_world = target_mesh.matrix_world @ v.co
            distances = []
            for bname, (head, tail) in bone_segments.items():
                # Bilateral symmetry isolation: prevent left-side limb bones
                # from capturing right-side vertices and vice-versa
                if bname.endswith('_l') and v_world.x < -0.02:
                    continue
                if bname.endswith('_r') and v_world.x > 0.02:
                    continue
                # Limb isolation: extreme arm vertices cannot take leg bones
                if abs(v_world.x) > 0.22 and bname in leg_bones:
                    continue
                # Extreme leg vertices cannot take arm bones
                if v_world.z < -0.25 and abs(v_world.x) < 0.25 and bname in arm_bones:
                    continue
                d = distance_point_to_segment(v_world, head, tail)
                distances.append((d, bname))
            
            distances.sort(key=lambda x: x[0])
            # Pick top 4 closest bones
            closest = distances[:4]
            # Inverse distance weighting with cubic falloff for localized limb binding: w_i = 1 / (d_i + eps)^3
            eps = 0.03
            raw_weights = [1.0 / math.pow(d + eps, 3) for d, _ in closest]
            total_raw = sum(raw_weights)
            for (d, bname), w in zip(closest, raw_weights):
                norm_w = w / total_raw
                vg_idx = vg_indices[bname]
                target_mesh.vertex_groups[vg_idx].add([v.index], norm_w, 'REPLACE')
            fallback_assigned += 1

    # 6. Clamp to max 4 influences per vertex and renormalize
    for v in verts:
        groups = [(g.group, g.weight) for g in v.groups if g.weight > 0.0001]
        if len(groups) > 4:
            groups.sort(key=lambda x: x[1], reverse=True)
            to_keep = groups[:4]
            to_remove = groups[4:]
            total = sum(w for _, w in to_keep)
            for g_idx, _ in to_remove:
                target_mesh.vertex_groups[g_idx].remove([v.index])
            for g_idx, w in to_keep:
                norm_w = w / total if total > 0 else 0.25
                target_mesh.vertex_groups[g_idx].add([v.index], norm_w, 'REPLACE')
        elif len(groups) > 0:
            total = sum(w for _, w in groups)
            for g_idx, w in groups:
                norm_w = w / total if total > 0 else 1.0
                target_mesh.vertex_groups[g_idx].add([v.index], norm_w, 'REPLACE')

    # 7. Check critical bones coverage
    critical_bones = ['pelvis', 'spine_01', 'spine_02', 'Head', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r']
    weighted_counts = {b: 0 for b in bone_names}
    for v in verts:
        for g in v.groups:
            if g.weight > 0.01:
                vg_name = target_mesh.vertex_groups[g.group].name
                if vg_name in weighted_counts:
                    weighted_counts[vg_name] += 1

    empty_critical = [b for b in critical_bones if weighted_counts.get(b, 0) == 0]
    if empty_critical:
        raise RuntimeError(f"Rebind failed: critical bones have 0 weight: {empty_critical}")

    # 8. Export GLB
    out_dir = os.path.dirname(out_glb_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    target_mesh.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    bpy.ops.export_scene.gltf(
        filepath=out_glb_path,
        export_format='GLB',
        use_selection=True,
        export_animations=True,
        export_apply=False,
        export_def_bones=False,
        export_current_frame=False,
        export_all_influences=True
    )

    # 9. Generate Report
    report = {
        'status': 'rebound',
        'bodyPlan': 'humanoid-v1',
        'boneHeat': bone_heat_success,
        'boneCount': len(bone_names),
        'vertexCount': len(verts),
        'polygonCount': len(target_mesh.data.polygons),
        'unweightedInitialVertices': unweighted_count,
        'fallbackAssignedVertices': fallback_assigned,
        'finalUnweightedVertices': 0,
        'maxInfluencesPerVertex': 4,
        'meshBounds': {
            'height': mesh_height,
            'min': [mesh_min.x, mesh_min.y, mesh_min.z],
            'max': [mesh_max.x, mesh_max.y, mesh_max.z]
        },
        'weightedBones': {b: count for b, count in weighted_counts.items() if count > 0}
    }

    if report_path:
        rep_dir = os.path.dirname(report_path)
        if rep_dir:
            os.makedirs(rep_dir, exist_ok=True)
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)

    print(f"Rebind complete. Exported to {out_glb_path} (vertices: {len(verts)}, fallback: {fallback_assigned})")

if __name__ == '__main__':
    args = parse_args()
    mesh_arg = args.get('mesh')
    donor_arg = args.get('donor')
    out_arg = args.get('out')
    report_arg = args.get('report')

    if not mesh_arg or not donor_arg or not out_arg:
        print("Usage: blender --background --python blender-rebind.py -- --mesh <mesh.glb> --donor <donor.glb> --out <out.glb> [--report <report.json>]")
        sys.exit(1)

    rebind(mesh_arg, donor_arg, out_arg, report_arg)
