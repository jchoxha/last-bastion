# Last Bastion — Endless Frontier

A browser roguelike combining connected plateaus and ramps, infinite terrain exploration, class abilities, portal defenses, and NPC settlements.

## Play the current version

**Live game:** https://jchoxha.github.io/last-bastion/

**Project directory:** https://jchoxha.github.io/project.html?p=last-bastion

Download this repository and open [playable/last-bastion-world-lab.html](playable/last-bastion-world-lab.html) in Chrome or Edge. The file includes the game and its runtime dependencies; no server is required. GitHub displays the file as source, so download it before opening it.

Saves live in browser storage. Export an important save from the game menu before switching browsers or moving the HTML file.

## Development

Use Node.js 24 LTS and npm.

```sh
npm ci
npm run build:standalone
```

The build regenerates `playable/last-bastion-world-lab.html` and also writes the legacy output to `../outputs/bonk-world-lab.html`. Open the playable file to test the result.

For the development server:

```sh
npm run dev
```

The repository retains its original React/Vinext/Sites scaffold. GitHub Pages builds use the standalone export rather than the server deployment.

## Source map

| Location | Purpose |
| --- | --- |
| `game/last-bastion-original.html` | Original game prototype used by the integration script |
| `game/*.js`, `game/*.css` | Gameplay systems, UI, collision, NPCs, terrain rendering and later overrides |
| `lib/world.ts` | Seeded terrain generation and incremental generation |
| `lib/save-game.ts` | Save format and validation |
| `app/bastion.tsx` | Main menu, game iframe, storage and game bridge |
| `scripts/integrate-bastion.cjs` | Combines the prototype and ordered gameplay modules |
| `lib/bastion-source.ts` | Generated game source; edit its inputs instead |
| `scripts/build-standalone.mjs` | Produces the standalone HTML |
| `tests/` | Simulation, generation, regression and browser checks |
| `playable/` | Committed playable baseline |

## Checks

```sh
npm run test:world
npm run test:game
npx tsc --noEmit
```

Focused frame-pacing checks:

```sh
node scripts/integrate-bastion.cjs
node --experimental-strip-types tests/frame-pacing.test.cjs
```

Some browser tests currently use absolute Windows Chrome/Playwright paths and a QA server on port 4177. See [tests/README.md](tests/README.md); making the browser harness portable is an early refactoring task. Historical tests may contain assumptions from earlier versions of the game.

## Refactoring approach

Preserve this playable baseline and the existing commit history. Refactor one system at a time, keeping behavior and saved games compatible.

1. Make the browser test setup portable and capture repeatable gameplay baselines.
2. Replace global function reassignment and script-order dependencies with explicit modules and interfaces.
3. Separate simulation state from Three.js rendering and DOM UI.
4. Extract terrain streaming, navigation scheduling, combat and settlement simulation into independently testable systems.
5. Centralize save migrations and ensure runtime caches never enter saved data.
6. Remove obsolete world-editor code and unused scaffold after checking dependencies.

The implementation has not been refactored as part of repository setup. The latest performance work and limitations are documented in [FRAME-PACING-NOTES.md](FRAME-PACING-NOTES.md).

## GitHub Pages publishing

This public repository hosts its own project site at https://jchoxha.github.io/last-bastion/.

Every push to `main` runs `.github/workflows/deploy.yml`: install dependencies, build the standalone game, stage `_site/`, and deploy using the official GitHub Pages Actions. Manual deployment is also available through Actions → Deploy to GitHub Pages → Run workflow.

```sh
npm run build:pages
```

The artifact contains the game as `index.html`, a `directory.json` play link, and `build.json` identifying the deployed source commit. No server or secrets are required. The existing `jchoxha.github.io` directory links to this project via `projects.js`; it does not contain a copy of the game.
