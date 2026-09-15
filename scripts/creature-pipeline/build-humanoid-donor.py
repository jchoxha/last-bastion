import bpy
import os
import sys

# Ensure clear state
bpy.ops.wm.read_factory_settings(use_empty=True)

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ual1_path = os.path.join(repo_root, 'public', 'motion-kits', 'humanoid-ual1.glb')
ual2_path = os.path.join(repo_root, 'public', 'motion-kits', 'humanoid-ual2.glb')
output_dir = os.path.join(repo_root, 'scripts', 'creature-pipeline', 'animations')
output_path = os.path.join(output_dir, 'humanoid-action-donor.glb')

os.makedirs(output_dir, exist_ok=True)

# 1. Import UAL1 to get armature and primary locomotion/reactions
bpy.ops.import_scene.gltf(filepath=ual1_path)

armature = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        armature = obj
        break

if not armature:
    raise RuntimeError("No armature found in humanoid-ual1.glb")

# Remove all mesh objects so donor is meshless / animation-only
for obj in list(bpy.data.objects):
    if obj.type == 'MESH':
        bpy.data.objects.remove(obj, do_unlink=True)

# Track actions to keep and rename
action_mapping = {
    'Idle_Loop': 'idle',
    'Walk_Loop': 'walk',
    'Jog_Fwd_Loop': 'run',
    'Sprint_Loop': 'run-alt',
    'Punch_Cross': 'attack-alt',
    'Hit_Chest': 'hit',
    'Death01': 'death',
}

actions_to_keep = {}
for act in bpy.data.actions:
    if act.name in action_mapping:
        act.name = action_mapping[act.name]
        actions_to_keep[act.name] = act

# 2. Import UAL2 to extract Sword_Regular_Combo as 'attack'
# We import UAL2 into a new collection or read actions
bpy.ops.import_scene.gltf(filepath=ual2_path)
for obj in list(bpy.data.objects):
    if obj != armature:
        bpy.data.objects.remove(obj, do_unlink=True)

for act in bpy.data.actions:
    if act.name == 'Sword_Regular_Combo':
        act.name = 'attack'
        actions_to_keep['attack'] = act

# Clean up unwanted actions
for act in list(bpy.data.actions):
    if act.name not in actions_to_keep:
        bpy.data.actions.remove(act)

print(f"Retained actions ({len(bpy.data.actions)}): {[a.name for a in bpy.data.actions]}")
print(f"Bones count in armature: {len(armature.data.bones)}")

# Select armature
bpy.ops.object.select_all(action='DESELECT')
armature.select_set(True)
bpy.context.view_layer.objects.active = armature

# Export GLB
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_apply=False,
    export_def_bones=False,
    export_current_frame=False,
    export_all_influences=True
)

print(f"Successfully exported humanoid donor to {output_path} (size: {os.path.getsize(output_path)} bytes)")
