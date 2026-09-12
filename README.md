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

The repository retains its original React/Vinext/Sites scaffold. Creating this repository does not publish a website or configure deployment.

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

The source repository is private. Its current GitHub plan does not allow Pages from private repositories, so the standalone build is hosted in the public `jchoxha/jchoxha.github.io` repository under `last-bastion/`. Only the playable bundle and public metadata are copied; the source history remains here. Browser-delivered game code is necessarily public.

To publish an update with a local clone of that repository:

```sh
npm run build:standalone
node scripts/publish-pages.mjs ../github-pages
```

Review, commit and push the changes in `../github-pages`; its existing Pages deployment publishes them. `projects.js` in that repository owns the directory card. `last-bastion/build.json` records the source commit used for the release. Build and commit source changes before staging a release so that commit is accurate.

Source pushes alone do not deploy the game. This workflow needs no additional access tokens or Actions secrets.
