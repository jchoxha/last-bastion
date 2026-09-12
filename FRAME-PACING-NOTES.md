# Frame pacing update — September 12, 2026

Open `last-bastion-world-lab.html`. Save your current run before refreshing, then load it. Existing plateau saves receive these changes; a new game is not required.

## Changes

- Nearby plateau terrain is divided into reusable 4-by-4 tile patches. Exploration adds missing patches over multiple frames and retains overlapping geometry.
- Grass, bushes and flowers are prepared incrementally. The old foliage stays visible until its replacement is ready.
- NPC and enemy grid searches resume between frames with a shared time budget. Searches take turns so a difficult destination does not monopolize the queue. Collision changes invalidate old searches; completed paths are copied before actors consume them.
- Plateau world expansion extends the existing world in place, including new tree batches. It no longer saves and restores the whole game at an exploration boundary. The player, NPCs, buildings and resource objects retain their identities.
- Terrain cache eviction is gradual instead of clearing the entire cache at once.
- Saving no longer parses and validates the game's own freshly serialized snapshot a second time. Loading and importing still validate saves.

## Verification

A repeatable, 240-update Chrome simulation test traversed the same seeded terrain before and after the changes. The original peaked at 328 ms for exploration, 103 ms for enemy updates, and 451 ms for a forced expansion. Post-change repeated runs showed exploration peaks of approximately 23–49 ms. In the measured incremental expansion run, 15 steps completed the expansion and the longest step was 6.5 ms.

These are CPU simulation timings in headless Chrome, not an FPS guarantee or GPU measurements. Browser garbage collection can still cause occasional short pauses. Initial loading, manual terrain rebuilds, and very large saves can still take time. The explored world is still retained in memory; unbounded long-distance exploration will eventually increase memory use. Legacy rolling-terrain saves retain their older expansion implementation.

Automated checks cover deterministic generation, chunk reuse, foliage swaps, incremental expansion, actor identity, save restoration, navigation completion/cancellation/fairness, laborer construction and training, combat waves, teleportation, ramps and climbing. Browser checks also verify input, the stamina HUD, exploration, combat and absence of JavaScript errors.

Tests: `node --experimental-strip-types tests/frame-pacing.test.cjs` and `node tests/browser-spikes.cjs` (the browser test expects the local QA server at port 4177).
