# Current verification

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
