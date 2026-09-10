# Rolling frontier update

Open `last-bastion-world-lab.html`. Save before refreshing. Start a **new game** to get the new generator; existing saves retain their terrain and scale.

## World creation

The built-in world editor and saved-map selector are removed from the game. Choose New game, optionally enter a seed, then choose your class. A blank seed creates a fresh random seed for every new run. Identical custom seeds reproduce the terrain.

New worlds use **2× terrain scale**: a building grid square is 12 metres wide and one elevation unit is 6 metres. Characters and furniture remain human-sized. Walls span one grid edge.

## Terrain and exploration

New terrain is continuous rolling ground, with broad hills, shallow dips and gently rounded transitions instead of vertical tile cliffs. The visible surface and collision sample the same heights. Ordinary walking handles natural slopes; jumping is still available.

Terrain generates ahead of exploration with no configured maximum size or 1024-tile world boundary. Grass, flowers and bushes are instanced around the player; the detailed ground mesh follows the player. Newly explored regions can reveal ruins, pools, dungeons and independent settlements. Visited discoveries and changes persist in saves.

The current prototype retains explored gameplay cells in memory. Rendering is local, but memory and save size still grow with exploration; this is not yet Minecraft-style disk-backed chunk unloading. Very long runs remain subject to browser memory and storage limits.

Natural terrain no longer needs built-in ramps. Construction stairs and legacy ramp saves remain supported, along with walls, gates and the settlement systems.

## Model rig corrections

Voxel limbs now pivot from shoulders and hips instead of their lower ends. Head details follow the head, and shields and staves follow their arms. The old player shoulder twist no longer conflicts with the voxel animation. Shared seeded recipes remain available for generating creatures. This keeps the inexpensive modular models viable while leaving room for more detailed art later.

## Verification

Checked deterministic seeds; 2× dimensions; walking slopes; grass/bush rendering; limb geometry and attachment parents; existing terrain, trees, buildings, residents and gold across expansion; and save reload. Browser checks compare visible terrain against downward collision rays and cover the simplified creation screen.
