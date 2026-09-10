# Plateau terrain correction

New games use the original connected plateau-and-ramp generator again, at **2× scale**. The seed-only menu, automatic terrain expansion, nearby grass/bushes and settlement systems remain.

The terrain keeps distinct integer elevation levels and broad plateau tops. Cliff rims have a narrow rounded bevel (0.9m wide at 2×); cliff faces remain steep and solid. Ramp feet and crests ease into their landings, while ramps still connect levels. Plain surfaces gain subtle continuous bumps and dips of at most about 18cm from their base height. Existing base courtyards stay level.

This replaces the rolling-prairie default. Save before refreshing and start a **new game** to obtain plateau generation. Older prairie saves retain their landscape rather than having buildings and NPCs displaced by a terrain conversion.

Checks cover original generator connectivity, rounding confined to the cliff rim, ordinary player/NPC travel up ramps, blocked cliff traversal, subtle plain relief, expansion preservation, save/load and browser rendering. The generator retains the previous prototype limitation: explored gameplay cells remain in memory even though rendering is local.
