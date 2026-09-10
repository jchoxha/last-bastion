# Current verification

- `npm run test:game`: integrates the game and checks construction, staffing, training, wards, node regrowth, save/load, shared-edge walls/wire, manual work, follow continuity, talent prerequisites, portal teleportation, siege completion, trading, captured buildings and constructed ramps.
- `npm run test:world`: 57 seeded terrain connectivity, ramp, expansion and preservation checks.
- `node tests/geometry.test.cjs`: opaque ramp sides and third-person camera obstruction.
- `node tests/browser-campaign.cjs`: native Chrome UI checks for the catalog, wall plans, Escape, NPC priority checkboxes, settlement browser, talents, merchant trading and save restoration.
- `node tests/browser-placement.cjs`: native mouse and F placement with visible failure feedback.

Browser tests use the current standalone copied to `work/placement-qa.html`, served on localhost:4177, with installed Chrome and bundled Playwright. Test pages have separate storage from the user's file-based session.

Earlier combat/frontier/rework scripts retain assumptions from previous game rules. The settlement and campaign suites cover the current behavior.
