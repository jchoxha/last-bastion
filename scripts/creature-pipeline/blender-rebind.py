import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Matrix, Vector, Quaternion, Euler

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

def apply_arm_flare(actions, flare_deg=18.0):
    if abs(flare_deg) < 1e-4:
        return
    q_flare_l = Quaternion((math.cos(math.radians(flare_deg) / 2.0), 0.0, 0.0, math.sin(math.radians(flare_deg) / 2.0)))
    q_flare_r = Quaternion((math.cos(math.radians(-flare_deg) / 2.0), 0.0, 0.0, math.sin(math.radians(-flare_deg) / 2.0)))

    for act in actions:
        channel_bags = []
        if hasattr(act, 'layers') and act.layers:
            for layer in act.layers:
                for strip in layer.strips:
                    if hasattr(strip, 'channelbags'):
                        channel_bags.extend(strip.channelbags)

        fcurve_sources = channel_bags if channel_bags else [act]
        for src in fcurve_sources:
            if not hasattr(src, 'fcurves'):
                continue
            fc_l = {}
            fc_r = {}
            fc_eul_l = {}
            fc_eul_r = {}
            for fc in src.fcurves:
                if 'upperarm_l' in fc.data_path and 'rotation_quaternion' in fc.data_path:
                    fc_l[fc.array_index] = fc
                elif 'upperarm_r' in fc.data_path and 'rotation_quaternion' in fc.data_path:
                    fc_r[fc.array_index] = fc
                elif 'upperarm_l' in fc.data_path and 'rotation_euler' in fc.data_path:
                    fc_eul_l[fc.array_index] = fc
                elif 'upperarm_r' in fc.data_path and 'rotation_euler' in fc.data_path:
                    fc_eul_r[fc.array_index] = fc

            if len(fc_l) == 4:
                num_kps = len(fc_l[0].keyframe_points)
                for k in range(num_kps):
                    w = fc_l[0].keyframe_points[k].co[1]
                    x = fc_l[1].keyframe_points[k].co[1]
                    y = fc_l[2].keyframe_points[k].co[1]
                    z = fc_l[3].keyframe_points[k].co[1]
                    q_new = Quaternion((w, x, y, z)) @ q_flare_l
                    fc_l[0].keyframe_points[k].co[1] = q_new.w
                    fc_l[1].keyframe_points[k].co[1] = q_new.x
                    fc_l[2].keyframe_points[k].co[1] = q_new.y
                    fc_l[3].keyframe_points[k].co[1] = q_new.z

            if len(fc_r) == 4:
                num_kps = len(fc_r[0].keyframe_points)
                for k in range(num_kps):
                    w = fc_r[0].keyframe_points[k].co[1]
                    x = fc_r[1].keyframe_points[k].co[1]
                    y = fc_r[2].keyframe_points[k].co[1]
                    z = fc_r[3].keyframe_points[k].co[1]
                    q_new = Quaternion((w, x, y, z)) @ q_flare_r
                    fc_r[0].keyframe_points[k].co[1] = q_new.w
                    fc_r[1].keyframe_points[k].co[1] = q_new.x
                    fc_r[2].keyframe_points[k].co[1] = q_new.y
                    fc_r[3].keyframe_points[k].co[1] = q_new.z

            if len(fc_eul_l) == 3:
                num_kps = len(fc_eul_l[0].keyframe_points)
                for k in range(num_kps):
                    ex = fc_eul_l[0].keyframe_points[k].co[1]
                    ey = fc_eul_l[1].keyframe_points[k].co[1]
                    ez = fc_eul_l[2].keyframe_points[k].co[1]
                    q_new = Euler((ex, ey, ez), 'XYZ').to_quaternion() @ q_flare_l
                    e_new = q_new.to_euler('XYZ')
                    fc_eul_l[0].keyframe_points[k].co[1] = e_new.x
                    fc_eul_l[1].keyframe_points[k].co[1] = e_new.y
                    fc_eul_l[2].keyframe_points[k].co[1] = e_new.z

            if len(fc_eul_r) == 3:
                num_kps = len(fc_eul_r[0].keyframe_points)
                for k in range(num_kps):
                    ex = fc_eul_r[0].keyframe_points[k].co[1]
                    ey = fc_eul_r[1].keyframe_points[k].co[1]
                    ez = fc_eul_r[2].keyframe_points[k].co[1]
                    q_new = Euler((ex, ey, ez), 'XYZ').to_quaternion() @ q_flare_r
                    e_new = q_new.to_euler('XYZ')
                    fc_eul_r[0].keyframe_points[k].co[1] = e_new.x
                    fc_eul_r[1].keyframe_points[k].co[1] = e_new.y
                    fc_eul_r[2].keyframe_points[k].co[1] = e_new.z

def rebind(mesh_path, donor_path, out_glb_path, report_path=None, arm_flare=18.0):
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. Import donor armature
    if not os.path.exists(donor_path):
        raise FileNotFoundError(f"Donor GLB not found: {donor_path}")
    bpy.ops.import_scene.gltf(filepath=donor_path, disable_bone_shape=True)
    
    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break
    if not armature:
        raise RuntimeError("No armature in donor GLB.")

    # Remove any donor meshes, clear custom shapes, and clean mesh datablocks
    for pb in armature.pose.bones:
        pb.custom_shape = None
    for obj in list(bpy.data.objects):
        if obj.type == 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m, do_unlink=True)

    # Ensure clean unposed rest state
    if armature.animation_data:
        armature.animation_data.action = None
    for pb in armature.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

    # 2. Import target mesh
    if not os.path.exists(mesh_path):
        raise FileNotFoundError(f"Mesh GLB not found: {mesh_path}")
    bpy.ops.import_scene.gltf(filepath=mesh_path, disable_bone_shape=True)

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

    # 4. Partition limbs and lift arms into canonical horizontal T-pose
    bm = bmesh.new()
    bm.from_mesh(target_mesh.data)
    visited = set()
    islands = []
    for v in bm.verts:
        if v.index in visited:
            continue
        island = []
        q = [v]
        visited.add(v.index)
        while q:
            curr = q.pop()
            island.append(curr.index)
            for e in curr.link_edges:
                other = e.other_vert(curr)
                if other.index not in visited:
                    visited.add(other.index)
                    q.append(other)
        islands.append(island)

    left_arm_verts = set()
    right_arm_verts = set()
    body_verts = set()

    if len(islands) >= 5:
        # Multi-component model (e.g. discrete armor plates, gauntlets, pauldrons)
        for isl in islands:
            isl_coords = [target_mesh.data.vertices[idx].co for idx in isl]
            cen = sum(isl_coords, Vector((0, 0, 0))) / len(isl_coords)
            min_x, max_x = min(c.x for c in isl_coords), max(c.x for c in isl_coords)
            min_z, max_z = min(c.z for c in isl_coords), max(c.z for c in isl_coords)

            if cen.z > -0.20 and min_z > -0.22:
                if max_x > 0.16 and (max_z > 0.04 or max_x > 0.28):
                    left_arm_verts.update(isl)
                elif min_x < -0.16 and (max_z > 0.04 or min_x < -0.28):
                    right_arm_verts.update(isl)
                else:
                    body_verts.update(isl)
            else:
                body_verts.update(isl)
    else:
        # Continuous watertight mesh fallback
        for v in target_mesh.data.vertices:
            co = v.co
            if co.z > -0.22:
                if co.x > 0.16 and (co.z > 0.04 or co.x > 0.28):
                    left_arm_verts.add(v.index)
                elif co.x < -0.16 and (co.z > 0.04 or co.x < -0.28):
                    right_arm_verts.add(v.index)
                else:
                    body_verts.add(v.index)
            else:
                body_verts.add(v.index)

    # Rotate arms up by 55 degrees around shoulder pivot into canonical T-pose
    sh_l = armature.data.bones['upperarm_l'].head_local.copy()
    sh_r = armature.data.bones['upperarm_r'].head_local.copy()

    lift_angle = math.radians(55)
    rot_lift_l = Matrix.Rotation(-lift_angle, 3, 'Y')
    rot_lift_r = Matrix.Rotation(lift_angle, 3, 'Y')

    for idx in left_arm_verts:
        v = target_mesh.data.vertices[idx]
        v.co = sh_l + rot_lift_l @ (v.co - sh_l)

    for idx in right_arm_verts:
        v = target_mesh.data.vertices[idx]
        v.co = sh_r + rot_lift_r @ (v.co - sh_r)

    target_mesh.data.update()

    # 5. Attach armature modifier and vertex groups
    target_mesh.parent = armature
    arm_mod = target_mesh.modifiers.new(name='Armature', type='ARMATURE')
    arm_mod.object = armature
    arm_mod.use_vertex_groups = True

    bone_names = [b.name for b in armature.data.bones]
    for bname in bone_names:
        target_mesh.vertex_groups.new(name=bname)
    vg_indices = {vg.name: vg.index for vg in target_mesh.vertex_groups}

    # 6. Segmented anatomical skinning
    for v in target_mesh.data.vertices:
        p = target_mesh.matrix_world @ v.co
        x, y, z = p.x, p.y, p.z
        weights = {}

        if v.index in left_arm_verts:
            ax = abs(x)
            if ax < 0.13:
                weights['clavicle_l'] = 1.0
            elif ax < 0.16:
                t = (ax - 0.13) / 0.03
                weights['clavicle_l'] = 1.0 - t
                weights['upperarm_l'] = t
            elif ax < 0.28:
                weights['upperarm_l'] = 1.0
            elif ax < 0.32:
                t = (ax - 0.28) / 0.04
                weights['upperarm_l'] = 1.0 - t
                weights['lowerarm_l'] = t
            elif ax < 0.43:
                weights['lowerarm_l'] = 1.0
            elif ax < 0.47:
                t = (ax - 0.43) / 0.04
                weights['lowerarm_l'] = 1.0 - t
                weights['hand_l'] = t
            else:
                weights['hand_l'] = 1.0

        elif v.index in right_arm_verts:
            ax = abs(x)
            if ax < 0.13:
                weights['clavicle_r'] = 1.0
            elif ax < 0.16:
                t = (ax - 0.13) / 0.03
                weights['clavicle_r'] = 1.0 - t
                weights['upperarm_r'] = t
            elif ax < 0.28:
                weights['upperarm_r'] = 1.0
            elif ax < 0.32:
                t = (ax - 0.28) / 0.04
                weights['upperarm_r'] = 1.0 - t
                weights['lowerarm_r'] = t
            elif ax < 0.43:
                weights['lowerarm_r'] = 1.0
            elif ax < 0.47:
                t = (ax - 0.43) / 0.04
                weights['lowerarm_r'] = 1.0 - t
                weights['hand_r'] = t
            else:
                weights['hand_r'] = 1.0

        elif z <= 0.04 and abs(x) >= 0.03:
            side = '_l' if x > 0 else '_r'
            if z > 0.00:
                t = z / 0.04
                weights['pelvis'] = t * 0.5
                weights['thigh' + side] = 1.0 - (t * 0.5)
            elif z > -0.14:
                weights['thigh' + side] = 1.0
            elif z > -0.20:
                t = (-0.14 - z) / 0.06
                weights['thigh' + side] = 1.0 - t
                weights['calf' + side] = t
            elif z > -0.38:
                weights['calf' + side] = 1.0
            elif z > -0.43:
                t = (-0.38 - z) / 0.05
                weights['calf' + side] = 1.0 - t
                weights['foot' + side] = t
            else:
                weights['foot' + side] = 1.0

        elif z >= 0.34:
            if z < 0.38:
                t = (z - 0.34) / 0.04
                weights['spine_03'] = (1.0 - t) * 0.5
                weights['neck_01'] = 1.0 - (1.0 - t) * 0.5
            else:
                t = min(1.0, (z - 0.38) / 0.04)
                weights['neck_01'] = (1.0 - t) * 0.3
                weights['Head'] = 1.0 - ((1.0 - t) * 0.3)

        else:
            if z < 0.08:
                t = max(0.0, (z + 0.10) / 0.18)
                weights['pelvis'] = 1.0 - t * 0.4
                weights['spine_01'] = t * 0.4
            elif z < 0.18:
                t = (z - 0.08) / 0.10
                weights['spine_01'] = 1.0 - t
                weights['spine_02'] = t
            elif z < 0.28:
                t = (z - 0.18) / 0.10
                weights['spine_02'] = 1.0 - t
                weights['spine_03'] = t
            else:
                t = (z - 0.28) / 0.06
                weights['spine_03'] = 1.0 - (t * 0.3)
                weights['neck_01'] = t * 0.3

        tot = sum(weights.values())
        if tot > 1e-6:
            for bname, w in weights.items():
                norm_w = w / tot
                vg_idx = vg_indices[bname]
                target_mesh.vertex_groups[vg_idx].add([v.index], norm_w, 'REPLACE')

    # 7. Check critical bones coverage
    critical_bones = ['pelvis', 'spine_01', 'spine_02', 'Head', 'upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r']
    weighted_counts = {b: 0 for b in bone_names}
    for v in target_mesh.data.vertices:
        for g in v.groups:
            if g.weight > 0.01:
                vg_name = target_mesh.vertex_groups[g.group].name
                if vg_name in weighted_counts:
                    weighted_counts[vg_name] += 1

    empty_critical = [b for b in critical_bones if weighted_counts.get(b, 0) == 0]
    if empty_critical:
        raise RuntimeError(f"Rebind failed: critical bones have 0 weight: {empty_critical}")

    # 8. Apply arm flare offset for bulky humanoid proportions
    apply_arm_flare(bpy.data.actions, flare_deg=arm_flare)

    # 9. Reset pose and clear action before export
    if armature.animation_data:
        armature.animation_data.action = None
    for pb in armature.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

    # 10. Export GLB (disable backface culling so materials are double-sided)
    for mat in bpy.data.materials:
        mat.use_backface_culling = False

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

    # 11. Generate Report
    report = {
        'status': 'rebound',
        'bodyPlan': 'humanoid-v1',
        'boneHeat': False,
        'boneCount': len(bone_names),
        'vertexCount': len(target_mesh.data.vertices),
        'polygonCount': len(target_mesh.data.polygons),
        'unweightedInitialVertices': 0,
        'fallbackAssignedVertices': len(target_mesh.data.vertices),
        'finalUnweightedVertices': 0,
        'maxInfluencesPerVertex': 2,
        'armFlareDeg': arm_flare,
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

    print(f"Rebind complete. Exported to {out_glb_path} (vertices: {len(target_mesh.data.vertices)})")

if __name__ == '__main__':
    args = parse_args()
    mesh_arg = args.get('mesh')
    donor_arg = args.get('donor')
    out_arg = args.get('out')
    report_arg = args.get('report')
    flare_arg = float(args.get('arm-flare', 18.0))

    if not mesh_arg or not donor_arg or not out_arg:
        print("Usage: blender --background --python blender-rebind.py -- --mesh <mesh.glb> --donor <donor.glb> --out <out.glb> [--report <report.json>] [--arm-flare <deg>]")
        sys.exit(1)

    rebind(mesh_arg, donor_arg, out_arg, report_arg, flare_arg)
