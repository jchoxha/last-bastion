# Performance, rocky cliffs and climbing

Save before refreshing `last-bastion-world-lab.html`. Existing saves can use this update; plateau saves receive the revised cliff rendering when loaded.

## Climbing

- Hold **Space + W** while facing a nearby vertical cliff or constructed wall to climb.
- While holding Space, use **A/D** to traverse sideways or **S** to descend.
- Hold **Shift** for faster climbing at a higher stamina cost.
- Release **Space** or press **Escape** to drop.
- Reaching a clear ledge pulls the player onto it automatically.

The stamina meter appears while climbing or recovering. Moving drains 18 stamina/second (32 while climbing faster); hanging drains 4/second. At zero, the player loses their grip. Resting on the ground restores stamina after a short delay. A saved climbing session resumes airborne rather than restoring a stale wall attachment.

## Movement and terrain

Grounded movement updates foot height on every small movement step, which avoids ramp stalls during slow frames. Cliffs have layered, irregular rock faces and broken rim profiles. Collision and gameplay rays include the small cliff-face protrusions. Generated plateaus and their connecting ramps remain intact.

## Performance changes

Aiming, projectile obstruction and line-of-sight checks query terrain heights and physical collision shapes instead of raycasting through every detailed mesh and decorative grass instance. Results of repeated aim checks are reused within the update. Enemy route checks are briefly cached; strategic path edges use bounded obstacle detours. Nearby actors remain articulated, while distant voxel actors use a single baked mesh. Terrain rebuilds reuse unchanged tile geometry. Render resolution is capped at 1.5 device pixels per CSS pixel and the sun uses a 1024px shadow map.

A headless Chrome simulation with roughly 24–30 nearby enemies measured a 1.5ms median update and a 13.7ms 95th percentile in the recorded check. This is simulation time, not total GPU frame time or a promised FPS on every computer. Large world expansions still rebuild the active world, and explored gameplay cells still accumulate in memory.
