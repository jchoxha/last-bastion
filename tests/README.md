# Current verification

- `node tests/browser-creature-cloud.cjs` after the standalone build: mocked GitHub connection/dispatch, text-mode request, token isolation, repeat-click protection, explicit recovery, disconnect and mobile layout. No real workflow or provider call is submitted.

- `npm run test:creatures`: deterministic creature definitions, schema/import boundaries, body-plan compatibility, actual prototype rest joints, and an AI service with a mocked upstream (no API charges).
- `npm run test:creature-pipeline`: real worker orchestration and Tripo adapter with simulated HTTP responses, a test-only textured skin, GLB validation, atomic installation, rig mismatch rejection, missing credentials, duplicate-charge prevention and local HTTP boundaries. No provider credits are used.
- `node tests/browser-creature-pipeline.cjs` after the pipeline tests and standalone build: uses their synthetic fixture to verify textured GLB loading, independently animated skeletons, shared geometry/private hit materials, checksum rejection, UI/mobile, actual generated-model enemies and fresh save restoration. This is integration coverage, not a claim of AI mesh/rig quality.
- `node tests/browser-creatures.cjs` after the standalone build: forge UI, library persistence, invalid imports, actual GLB export, enemy spawning, save/reload, mobile layout and offline generation.

- `npm run test:wiki`: guide structure, generated-content freshness, source paths, current move cooldowns, building base prices, and settlement/structure recipes.
- `node tests/browser-wiki.cjs` after `npm run build:standalone`: main-menu access without a run, search/no-results, chapter deep links and history, responsive tables, focus restoration, and preserving the same paused game through a wiki visit. Uses a temporary localhost port and saves screenshots under `work/`.

- `node tests/browser-lag-spikes.cjs` (after `npm run build:standalone`): runs the playable build in Chrome on a temporary localhost server, checks streaming across animation frames and actual DOM mutations, and saves diagnostics in `work/`.

- `node tests/lag-spikes.test.cjs`: resumable terrain patches, hidden partial geometry, cancellation after teleporting, save isolation, and throttling across the complete HUD update chain. Logs streaming CPU time; timing is diagnostic rather than a machine-dependent pass/fail threshold.

- `npm run test:game`: integrates the game and checks construction, staffing, training, wards, node regrowth, save/load, shared-edge walls/wire, manual work, follow continuity, talent prerequisites, portal teleportation, siege completion, trading, captured buildings and constructed ramps.
- `npm run test:world`: 57 seeded terrain connectivity, ramp, expansion and preservation checks.
- `node tests/geometry.test.cjs`: opaque ramp sides and third-person camera obstruction.
- `node tests/browser-campaign.cjs`: native Chrome UI checks for the catalog, wall plans, Escape, NPC priority checkboxes, settlement browser, talents, merchant trading and save restoration.
- `node tests/browser-placement.cjs`: native mouse and F placement with visible failure feedback.

Browser tests use the current standalone copied to `work/placement-qa.html`, served on localhost:4177, with installed Chrome and bundled Playwright. Test pages have separate storage from the user's file-based session.

Earlier combat/frontier/rework scripts retain assumptions from previous game rules. The settlement and campaign suites cover the current behavior.

- `node tests/expedition.test.cjs`: actual 4x terrain, stairs, footprint/corner collision, crew requirements, reset work, seeded recipes and save/load.
- `node tests/browser-rolling.cjs`: current seed-only menu, 2x default, rendered ground/collision agreement, foliage, pivots, expansion and save restoration.
- `node --experimental-strip-types tests/rolling-world.test.cjs`: deterministic rolling generation, walkable slopes, preservation of trees/buildings/NPCs through expansion, and articulated joint bounds.
- `browser-expedition.cjs` records the previous 4x/cliff UI and is historical; `expedition.test.cjs` continues to verify legacy stair and cliff-save behavior.

Current new-world default: `node tests/browser-plateaus.cjs` and `node --experimental-strip-types tests/rounded-plateaus.test.cjs`. Rolling-world tests retain coverage for prairie saves from the previous update.

- `node tests/browser-traversal.cjs`: actual climb key presses, stamina HUD, release, and 24-nearby-enemy simulation timing.
- `node --experimental-strip-types tests/traversal-performance.test.cjs`: low-framerate ramp steps, cliff/wall climbing, mantle, stamina exhaustion/recovery, gameplay rays and safe airborne saves.
