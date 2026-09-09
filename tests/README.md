# Current verification

- `npm run test:game` builds the integrated game and verifies the current settlement loop, construction, NPC training, production, level unlocks, wards, node regrowth and save/load.
- `npm run test:world` checks seeded world connectivity and expansion.
- `node --experimental-strip-types tests/geometry.test.cjs` checks camera obstruction and ramp walls.
- Browser scripts require current standalone copies at `work/settlement-qa.html` and `work/frontier-qa.html`, served on localhost:4177. They use the installed Chrome and bundled Playwright runtime.

Earlier bastion/combat/frontier/rework/navigation-controls files preserve tests for the previous game rules (instant builds, no starting base and all abilities initially unlocked). The current gameplay suite supersedes those assumptions.
