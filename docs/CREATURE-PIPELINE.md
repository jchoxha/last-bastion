# Creature generation pipeline

Status: working authoring and runtime prototype. Open **Creature forge** on the main menu, or `#forge`. AI mesh generation, finished creature skins, companion AI, and new elemental combat effects are not implemented. No paid service is enabled by default.

## Try it now

1. Open Creature forge. Describe the creature, choose its taxonomy, physical body plan, form, role, and seed.
2. Click **Generate locally**. The same complete input gives the same definition. Concept text is retained as the description; local generation does not interpret natural language into a detailed mesh.
3. For **Canine quadruped** or **Humanoid biped**, inspect the animated prototype. Drag to orbit, zoom, toggle skeleton visibility, and compare rest / idle / walk poses.
4. Save to the device library, or export creature JSON. The library has 48 entries and is independent of game saves. Imported IDs and stats are recomputed; unsupported versions and invalid taxonomy are rejected.
5. To test gameplay, start a run, select a class, move outside the protected settlement into open terrain, and return to the menu's forge. **Spawn test enemy** inserts a hostile melee creature near you. Resume when ready. The normal enemy cap applies; each run allows 64 custom species, shared with the old voxel lab. Tests are real enemies in the current run, not a separate arena.
6. Save the run normally. Its custom species definitions and living creatures restore with the same prototype model. Removing a library entry does not remove an existing run creature.

Generated enemies currently use role-based health, speed, and melee damage, with form affecting health, damage and physical scale. They award no gold. Taxonomy, attunement and descriptive subtypes are metadata for later content systems; they do not imply elemental attacks, immunities, spells, or special equipment in this version. The preview's idle/walk animations are prototypes; attacks use existing game behavior without a bespoke attack clip.

## Definition and body plan are separate

The vocabulary is based on Chimera Cards at commit `38a3f180eabe0c2684590ac7956cb489ea545c04`, particularly `docs/biology-kits.md` section 9 and the current kit data. It is an explicit snapshot, not a live synchronization of the repositories. No Chimera combat engine or save format was copied.

- Body types: Humanoid, Beast, Aberration; up to two per creature.
- Beast families: Mammalian, Reptilian, Avian, Piscine, Insectoid, Amphibian, Draconic.
- Aberration manifestations: Eldritch, Construct, Ooze, Flora, Crystalline, Formless, Parasitic, Abyssal, Fungal.
- All 11 descriptive subtypes, 13 attunements, eight humanoid archetypes, and five current size forms are represented.
- A physical plan is chosen independently within the supported compatibility list. That list is intentionally small: it does not yet describe every plausible skeleton within a family or hybrid. Expand it alongside tested rigs. In particular, humanoid hybrids use a humanoid prototype, while Aberration combinations remain concepts.
- Avian, aquatic, arthropod, draconic, serpentine, amorphous and radial plans are marked **planned**. They can produce definitions and reference briefs, but cannot be previewed or spawned as if they had a working rig.

`lib/creatures/core.ts` owns validation, generation, stable content IDs, derived statistics, reference prompts, and the provider contract. Providers cannot supply arbitrary code, stat overrides, executable effects, remote asset URLs or unreviewed rigs. Displayed free text is rendered as text by React.

## What the rig exports mean

**Export prototype GLB** produces a binary glTF containing an articulated placeholder, named bones, rigid per-bone skin weights, and idle/walk animation clips. It can be inspected in Blender without purchasing a model-generator subscription. It is not a finished wolf, a Voltfang likeness, or a production-quality organic rig. Feet may slide during the simple walk cycle; no IK or foot locking is claimed.

**Export rig contract** records the physical-plan ID and revision, meter units, +Y up, +Z forward, model-space rest-joint positions, parent hierarchy, and clip names. **Export reference brief** provides the creature identity and neutral-pose constraints. There are no automatically generated reference images yet; use the brief together with rendered views of the approved base body when generating art.

Production asset stages:

1. Refine and approve the base body's joint placement, proportions, locomotion, and attack clips.
2. Render neutral reference views. Generate creature art around this approved body plan.
3. Generate or model the detailed mesh, preserving the body plan and separating effects from anatomy.
4. Fit geometry and transfer/paint weights. Check shoulders, hips, feet, jaw and tail under motion.
5. Validate GLB scale, hierarchy, clips, skinning, materials, geometry/texture budgets, and behavior in a crowded scene.
6. Add a reviewed asset manifest/loader with prototype fallback. This final-model import stage is future work; exported prototype files do not automatically become approved runtime assets.

Schema version and rig revision must change when their contracts change. Add explicit migrations before accepting old content with a new rig. A model or skeleton must never be serialized into a run save; retain creature definitions/asset IDs and recreate render objects.

## Optional AI authoring service

The browser's optional service authors the **name, description, body color and accent**. Selection, taxonomy, seed and body-plan constraints remain fixed. Stats are derived by game code. It does not generate an image or 3D mesh.

Run this on your own computer with Node.js 24+. The adapter uses a Chat Completions-compatible endpoint supporting JSON object responses. It can point to a local compatible inference server or a hosted provider you choose. Existing ChatGPT/Tripo memberships are not assumed to provide API credentials or export access.

Create an untracked `.env.creatures` file in the repository:

```dotenv
CREATURE_AI_URL=https://YOUR_PROVIDER/full/path/to/chat/completions
CREATURE_AI_MODEL=YOUR_CONFIGURED_MODEL
CREATURE_AI_KEY=YOUR_PROVIDER_KEY_IF_REQUIRED
```

For a local inference server, set its loopback HTTP URL and omit the key if it does not require one. The URL is the complete endpoint, not just a base URL. No endpoint/model/key is supplied by the project.

Start these in separate terminals:

```sh
npm run dev:creature-provider
npm run dev
```

Open the local app, then Creature forge → Optional AI authoring service. Leave the service URL as `http://127.0.0.1:8788/creatures`, and explicitly click **Generate through AI service**. Only then is the concept sent to the configured provider. Keys remain in the local service process and are never bundled into the public game.

The service binds to loopback, allows loopback browser origins, limits request/response sizes, rejects concurrent generation, times out requests, validates output, and performs no automatic retries. It returns an error without replacing the current creature when generation fails. Browser cancellation on leaving the forge aborts the request; this cannot guarantee reversal of provider work already begun.

For additional trusted origins, configure `CREATURE_ALLOWED_ORIGINS` as a comma-separated list of exact origins, for example `https://jchoxha.github.io`. Browsers may restrict a public site calling a local service; use the local app for the first setup. Offline file pages have a `null` origin and are not enabled by default. A public multiuser service would need authentication, user quotas, job persistence, and hosted secrets; do not expose this local development service as-is. GitHub Pages hosts only the client.

### Service contract

Request: `POST /creatures` with `{ "version": 1, "input": CreatureInput }`.

Success: `{ "version": 1, "spec": CreatureSpec }`. The client independently validates the spec, checks that selected constraints were preserved, and derives its own ID/stats/status. A provider adapter can be replaced without changing the forge or gameplay registry.

## Source map and checks

| Location                         | Responsibility                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `lib/creatures/core.ts`          | Portable schema, taxonomy, validators, deterministic generator, service client |
| `lib/creatures/actor.ts`         | Prototype bone hierarchy, proxy mesh, weights and clips                        |
| `app/bastion/creature-forge.tsx` | In-app authoring, preview, collection and exports                              |
| `game/creature-forge.js`         | Game bridge, custom species, enemy visuals and animation                       |
| `scripts/creature-provider.mjs`  | Optional local AI adapter with server-side credentials                         |
| `tests/creatures.test.mjs`       | Validation, determinism, rest-joint positions and mocked provider              |
| `tests/browser-creatures.cjs`    | Actual UI, GLB export, spawning, save/reload and responsive behavior           |

Run `npm run test:creatures` and the relevant game suites for schema/rig/runtime changes. Build with `npm run build:standalone`, then run `node tests/browser-creatures.cjs` for UI/GLB/game integration. Tests use a fake provider; they do not spend API credits. Update this document and the in-app wiki alongside changes.
