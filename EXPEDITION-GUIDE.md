# Large-world expedition update

Open **last-bastion-world-lab.html**. Save your current session before refreshing. New games and the world generator now default to **4× terrain scale**: tiles are 24m wide and elevation levels are 12m high. Existing saved worlds retain their saved scale and layout.

## Construction and navigation

People, creatures, furnishings and tower footprints retain their human-scale dimensions. Walls span an entire tile edge. Courtyard gates keep a roughly 3.4m doorway, with solid wall sections extending across the remainder of that edge.

**Wall stairs** replace new buildable ramps. Pick a flat tile beside terrain one level higher. The flight runs along that cliff face and ends on a small landing onto the upper terrain. **R** chooses the wall side; **T** reverses ascent. Adjacent flights can connect successive terrain levels; NPC routing can use connected stair flights. Existing completed ramp saves retain their original terrain surfaces.

Plan with **B**, place with **LMB / F**, and leave build mode with **Escape**. Laborers and the player work on stairs from the bottom of the flight. Natural terrain ramps remain part of world generation.

Collision now checks the capsule's width against terrain, blocks travel across raised platforms that touch only at a corner, and keeps the first-person near plane clear of cliff faces. World health bars are also occluded by solid geometry.

New starting bases have a cleared approach road through their courtyard gate. Resource nodes removed by courtyard shaping no longer attract workers. Residents spawn at separate positions. Workers skip destinations they cannot reach and patrols advance past blocked points instead of retrying forever.

## Operated defenses

Use **E** beside a defense to assign or release its operator:

- **Arrow towers / ballistas:** ranger.
- **Braziers / frost shrines / gale pylons:** pyromancer.
- **Spike / tar traps:** automatically trigger, then remain spent until reset. The player can reset from nearby with three interaction taps. Laborers with building enabled can travel there and perform reset work.
- **Barbed wire:** a passive slowing and damaging obstacle.

A tower only operates when its living, correctly trained operator reaches it. Giving that NPC another order releases the assignment. The two starting arrow towers have their own ranger crews.

Monsters acquire nearby visible players and friendly NPCs, retain short-term threat after being attacked, and give up excessively long pursuits.

## Voxel creatures and visual changes

Actors now use articulated voxel models with per-voxel surface variation, class equipment, walking and work animations. Monster recipes add details such as ears, horns, venom sacs, fuses and ice spines. Compatible rounded prop/effect primitives are converted to block geometry; aiming indicators remain clear geometric outlines.

Open **Testing → Voxel creature laboratory**, enter a seed, then select **Generate and spawn creature**. The same seed produces the same prototype recipe; recipes are stored with the run. This is a practical starting point for generating additional creatures without manually authoring model files. The lab is a testing feature and may spawn monsters inside protected areas.

The reusable recipe and model functions are in `game/voxel-models.js`. `registerCreatureRecipe(id, spec)` accepts a base species, name, health, speed and palette. Shared geometry and textures keep variants comparatively inexpensive. Custom species currently inherit base statistics and model features; bespoke special attacks still need behavior code.

The old orbiting cone birds are removed. A procedural sky dome adds a blue horizon, moving cloud bands and sun glow, with softer ambient lighting.

## Exploration

New runs generate:

- Meadow, desert, frost and wetland surface palettes.
- Shallow pools that slow movement; drinking restores some health when safe, with a cooldown.
- Salvageable ruins with rewards and relic choices.
- Independent settlements with traders, guards and ranger recruitment.
- Monster strongholds with persistent portals and capturable structures.
- Ashvault dungeons: enter through the central interaction point, defeat three increasingly dangerous chamber encounters, then recover the vault reward.

Villages, dungeons, pools and ruins appear on the minimap in gold, purple, blue and pale stone respectively. New layouts require a new game; existing runs keep their world and can use the updated controls, staffing rules and creature lab.

## Verification

Checked actual 4× dimensions, stair rise/landing clearance and unchanged tile centers, diagonal corner rejection, manning classes and releases, trap reset work, attack-triggered threat, recipe persistence, NPC travel, and save restoration. Chrome checks cover the default scale, voxel rendering, sky cleanup, creature generation across a fresh recipe restore, stairs and first-person cliff clearance. The existing settlement and terrain/camera checks remain part of regression coverage.
