# Creature generation pipeline

Status: automated Chimera → text or image → mesh → rig → animation → game installation is implemented, alongside the older procedural prototype. Open **Creature forge** on the main menu, or `#forge`. The first live Voltfang text-to-3D job passed technical validation and was installed on September 13, 2026: 18,896 triangles and 31 bones. On September 14 its animation set was upgraded to 26 clips: all 18 licensed DIMOS wolf animations plus eight gameplay fallbacks. Its original 20-credit mesh task was reused after fixing a storage-host download rejection. Anatomical rig quality remains under visual review. A Tripo API key and credits are required; jobs start only on explicit generation/resume actions.

## Automated model pipeline

The worker executes Chimera Cards' actual `forgeCreature` and validators from pinned commit `38a3f180eabe0c2684590ac7956cb489ea545c04`. It bundles that code locally and replaces only its text-provider transport. Chimera supplies definitions and its existing roster art; Last Bastion owns the model-facing art style in `scripts/creature-pipeline/art-prompt.mjs`. A matching image placed at `public/creatures/source-art/<id>[-<form>].png` overrides Chimera's baked portrait without modifying the Chimera repository. New concepts use Chimera's forge with Last Bastion's local low-poly art prompt. The direction translates bold cartoon identity into chunky, faceted characters with matte materials, restrained colors, separated anatomy and a neutral three-quarter view so portraits, generated meshes and terrain belong to one visual language. A heuristic fallback is treated as a failed production job, not a successful AI generation.

1. Resolve an existing Chimera creature and its art, or forge a new definition and portrait.
2. Derive a neutral modeling reference from that art, preserving identity while separating limbs and removing scenery/effects.
3. Generate a textured PBR mesh with a target of 20,000 faces. Source art that already follows the neutral low-poly schema can go directly to this stage with no additional image generation; less controlled art can use one normalization pass first.
4. Ask the provider to check the mesh's riggability. Reject a body-type mismatch. Explicitly request the quadruped or biped rig using `v2.5-20260210`; never rely on the API's biped default for a wolf.
5. Retarget an in-place provider walk and download the embedded GLB. Compatible canine rigs then receive the shared 26-animation set offline, without additional provider calls.
6. Validate the GLB and write immutable assets under `public/creatures/`, then update the manifest atomically. The browser refreshes the library and selects a completed creature automatically.
7. Installed creatures automatically replace ordinary wilderness **grunt** spawn slots. They also support the forge's explicit test-spawn action. Scripted raids and explicit enemy selections retain their species. Spawned definitions are saved with the run, subject to the existing 64-species limit.

Only canine quadrupeds and humanoid bipeds are wired through this first worker. Other forms need their own tested rig/animation adapters. Compatible canine rigs receive the full animation set described below. Other rigs retain their provider walk, with idle/rest in the bind pose and existing gameplay attacks. Creature identity is shared with Chimera, but its signature cards are retained as source data rather than installed as Last Bastion combat effects. Generated enemies currently award no gold.

### Generate from the GitHub Pages site

Open **Creature forge → Generate creatures on GitHub**. Generation runs on GitHub Actions, so this PC can be off. The browser calls GitHub; only the Actions runner calls Tripo.

1. In [repository Actions secrets](https://github.com/jchoxha/last-bastion/settings/secrets/actions), create `TRIPO_API_KEY` with your Tripo API key. Never enter that key in the game or commit it.
2. Create a fine-grained GitHub token restricted to **jchoxha/last-bastion**, with **Actions: read and write**. Enter this GitHub token in the forge and click **Connect GitHub**. It is held only in memory and cleared when leaving the forge, disconnecting or reloading. The workflow accepts only the repository owner's dispatches on `main`.
3. Start with roster ID `voltfang`, **Text to 3D**, **Canine quadruped**, **regular**. Edit appearance details and seed, then click **Generate and publish creature**. The worker adds anatomy/rest-pose constraints and calls Tripo text-to-model directly, without separate art generation or reference editing. Existing art remains the portrait if available; otherwise it uses Tripo's rendered model preview.
4. Follow the run link. Successful technical validation installs the assets, commits them directly to `main`, and explicitly dispatches Pages deployment. GitHub-token commits alone do not trigger the push deployment workflow. After deployment, click **Refresh published creatures** to load and inspect the model. Normal game startup also loads the published library.

No GitHub token in the game is necessary if you prefer the linked **Run workflow on GitHub** form with your GitHub login. Its default request is a text-based Voltfang generation; it uses the same secret and publishing path. The in-game cloud form starts from existing roster definitions; new concepts remain available through the local worker, or advanced workflow JSON with hosted `CREATURE_AI_URL`/`CREATURE_AI_MODEL` repository variables and optional `CREATURE_AI_KEY` secret. GitHub runners cannot use this PC's local Ollama.

At the published September 13, 2026 standard rates, text mesh + texture + rig + one walk is approximately **$0.55**; direct source art + mesh + rig + walk is approximately **$0.60**; adding one neutral-reference image makes the existing-art route approximately **$0.70**. Failed tasks may consume credits. Every new workflow dispatch is a separate job, even with the same seed. Inspect the run list before dispatching again if submission was not confirmed. No automatic paid retries occur. Prices and technical output quality are not guaranteed.

Failed jobs retain `creature-job` artifacts, including provider task IDs and intermediate models, for **30 days**. Use **Resume saved tasks** to dispatch a new workflow that restores the selected artifact. The GitHub **Re-run jobs** action is deliberately rejected before paid work. Missing/expired artifacts fail closed, and unknown submission outcomes are never automatically resubmitted. Hard interruption can prevent artifact upload: inspect the Tripo console before starting another job. A provider-reported failed task is retained rather than silently regenerated. GitHub serializes generation; avoid queuing many jobs because GitHub may replace an older pending run.

If generation finished but committing/deploying failed, recover the `installed-assets` artifact or rerun deployment after the asset commit. Do not regenerate the creature. Resuming a completed generation intentionally refuses new paid work. Job artifacts contain creature prompts and provider outputs, never API keys; do not use confidential concepts in this public project. A successful rig still needs visual inspection of joint placement and deformation.

Automated regression tests use mocked provider responses and synthetic assets. Separately, [live recovery run 34767650714](https://github.com/jchoxha/last-bastion/actions/runs/34767650714) completed generation, rigging, animation, technical validation and asset publishing for Voltfang. Passing technical validation does not certify anatomical quality.

### Start on this PC

Copy `creature-pipeline.env.example` to the untracked `.env.creatures` and set `TRIPO_API_KEY` locally. For **new concepts**, also set `CREATURE_AI_MODEL` and optionally `CREATURE_AI_URL`/`CREATURE_AI_KEY`. The default text endpoint is local Ollama's OpenAI-compatible endpoint; no model is downloaded or selected automatically. Existing roster creatures, including Voltfang, do not need text inference. Never paste keys into the app, source files, or a public manifest.

```sh
npm run dev:creature-pipeline
```

The worker binds to `http://127.0.0.1:8790`. On first start it clones Chimera into ignored `work/chimera-cards`, checks out the pinned revision, and bundles the source. `CHIMERA_SOURCE_DIR` can point at an existing checkout of that exact revision. It does not edit or push to Chimera. Updating the source pin requires testing its schema/art contracts again.

Open the local game → Creature forge → **Connect local worker**. Select Voltfang, Canine quadruped, regular, and seed `voltfang-1`. **Generate and install creature** starts the entire chain and consumes Tripo API credits. When credentials are absent, **Prepare Chimera inputs** saves the definition/art and shows the exact blocked stage without contacting Tripo. After configuration changes, restart the worker, reconnect, and **Resume saved job**.

Jobs continue when the forge is closed. Closing the worker pauses processing; restarting it requires explicit resume. Each stage's task ID is saved before polling. Resuming polls existing tasks instead of submitting duplicates. A connection failure after submitting but before receiving a task ID is marked uncertain; the worker refuses to resubmit automatically. Check the provider console to reconcile that case. Changing the seed creates a different job, which can incur new charges. There are no automatic generation retries or spending loops.

### Storage, hosting and validation limits

The first live text-to-model run exposed Tripo's asset host `tripo-data.rg1.data.tripo3d.com`, which is now accepted alongside its `.ai` hosts. Downloads require HTTPS, reject embedded credentials/nonstandard ports and redirects, and never send the Tripo API key to storage. If an unfamiliar host is rejected, retain the saved job and verify the provider response before extending the allowlist; resume the existing task rather than generating another mesh.

- `work/creature-pipeline/jobs/<job-id>/`: durable job state, complete Chimera definition, source art, neutral reference, mesh, rig and animated GLB. Failure retains successful stages. Provider keys are never written into job state.
- `public/creatures/index.json` and immutable `asset_<hash>.glb/.png`: only installed assets. The normal Pages build copies these files into the published game. The local worker installs files automatically; it does not autonomously commit/push provider output. Normal checked source/asset commits publish through the existing main-branch workflow.
- Public GitHub Pages is a static client. Its GitHub generation controls dispatch the Actions worker, which commits assets and deploys the updated site. The optional local worker still runs on this PC. A raw standalone HTML file requires the accompanying asset directory for generated models. Offline procedural prototypes still work without it.
- Game saves retain validated definitions, never meshes or provider URLs. The generated-asset manifest associates the creature's stable definition ID with its current asset. Missing/offline assets fall back to procedural visuals; the preview labels load failures. Keep the worker running for assets that have not been included in a published build.
- Technical checks reject invalid glTF, external resources, missing texture/skin/animation, excessive bone counts, and oversized content. Budgets are 32 MiB per GLB, 40,000 triangles, 96 bones, 12 draw primitives, 8 materials and 2048-pixel textures. At least 90% of vertices must be skinned. Runtime verifies SHA-256 before parsing, loads on demand, shares geometry/textures and clones skeletons and hit-flash materials per actor.
- These checks **cannot prove anatomically correct joint placement or attractive deformation**. Inspect shoulders, hips, paws, jaw and tail in the real animation before treating a creature as finished. The first live asset also needs orientation/scale and crowded-scene performance checks. Current loader normalization assumes Tripo's default +X-forward output and records the yaw in the manifest. Reference conditioning and choosing the right rig improve the inputs; they cannot guarantee a successful AI skeleton.

Local TRELLIS.2 weights were found on this PC, but the installed ComfyUI Python failed to start with `ModuleNotFoundError: No module named 'torch'`. TRELLIS supplies meshes, not rigs. A working local mesh backend plus a separately tested automatic rigging/animation backend remains an alternative integration, not a working free path in this release. No existing ComfyUI installation was modified.

Provider contracts checked against the official [image-to-model API](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard), [rig check](https://developers.tripo3d.ai/en/docs/animations-rig-check), [auto rig](https://developers.tripo3d.ai/en/docs/animations-rig), and [animation retargeting](https://developers.tripo3d.ai/en/docs/animations-retarget) documentation on September 12, 2026. Tripo Studio membership and API credentials/credits are separate configuration concerns; this integration does not bypass export restrictions.

## Procedural prototype tools

### Animation set and inspection

Compatible Tripo canine rigs receive 26 named clips. The core gameplay set remains **idle, walk, run, attack, hit, death, turn-left, turn-right, turn-around, charge, leap, cast, stagger, jump, land and spawn**. The forge also exposes an alternate attack and run, five additional idle performances, two greetings and a talk/vocalization clip. The shared builder removes older embedded animation sets before rebuilding the current set. Voltfang now uses this set; historical assets live in `tests/fixtures/creatures/` and are not published to Pages.

Use the single **Preview motion** selector in the forge. **Rest** shows the imported bind pose; all other entries play the selected clip. Toggle the skeleton and orbit around joints to inspect deformation. Playback supports pause, restart, 1/30-second frame stepping and 0.1×/0.25×/0.5×/1× speed. Loops wrap; one-shot actions hold their final pose. Playing an ended one-shot restarts it. Preview changes do not alter gameplay speed or consume API credits.

The preview rotates the whole creature for turn clips to illustrate steering. Their skeletal motion is in place: left/right share a small stepping cycle, while runtime heading supplies the direction. In gameplay, gentle turns limit angular speed and slow forward movement; sharp turns pivot before forward travel resumes. This is not planted-foot IK or a physically constrained turning circle.

Generated enemies with this set use idle, walk/run, spawn, turning, attack, hit and death automatically. Attack damage occurs at 40% of the attack duration, after a facing check and wind-up; impact rechecks range and target health. Death cancels pending attacks, leaves a non-targetable visual corpse until the clip finishes plus half a second, then disposes it. At most 16 such corpses remain visible. Strong knockback can interrupt an attack with stagger. Active actions and visual corpses are transient, not saved combat state.

Charge, leap, cast, jump and land are available clips for future abilities and forge inspection. Their presence does not give enemies new abilities, flight, elemental effects or jump navigation. Charge currently shares the gallop animation with run; leap and jump share the same donor jump. Cast, spawn and pivots are simple procedural motions that can be replaced under the same semantic names.

### Shared canine animation adapter

`scripts/creature-pipeline/animation-set.mjs` builds set version 2 using the canine rig profile revision 3. The primary donor is the 18-clip DIMOS Lost Ark wolf pack, used with direct project permission reported by the repository owner on September 14, 2026. Quaternius's CC0 wolf supplies hit, death, stagger, jump and landing fallbacks; Last Bastion supplies three procedural pivot clips. Donor meshes and textures are not included. Checksummed animation-only donors are bundled for offline jobs; precise provenance and the permission record are in `public/creatures/ANIMATION-CREDITS.md`.

The shared profile measures heading and proportions, maps all four paw controls, and preserves the generated mesh, skin weights and rest transforms. The latest walk keeps its procedural head/tail secondary motion and neutral-pose corrections. Other transferred clips use the same neutral calibration with their own donor movement. Voltfang's calibration is `headYawDegrees: -10`, with approximately +25.46° automatic tail centering. The head offset belongs to that asset; future generated faces still need visual calibration. Rest continues to show the unmodified imported pose.

Head/neck yaw can be supplied in calibration JSON, limited to ±60°. The default is zero and is reported as uncalibrated. Automatic tail centering rejects ambiguous or extreme geometry for review. Neither process guarantees that an asymmetric generated face looks forward. The forge has no calibration editor or arbitrary animation-file import yet.

```sh
node scripts/creature-pipeline/retarget.mjs INPUT.glb OUTPUT.glb
node scripts/creature-pipeline/retarget.mjs INPUT.glb OUTPUT.glb CALIBRATION.json
```

The command writes a new GLB and `OUTPUT.glb.report.json`, refusing to overwrite the input or an existing output. It builds the full set without provider calls or publishing. Generation jobs use the same builder and retain the historical artifact filenames `animation-trial.glb` and `animation-trial.json`; the report now has status `animation-set`, version, clip sources, calibration and review warnings. The manifest records available semantic clips and the retained walk index. Incompatible body plans/rigs keep the provider output and an explicit skip reason.

Validation covers the full GLB and each clip independently, preserving mesh data and checking loops and animation budgets (up to 32 clips). Tests cover one real generated canine and synthetic proportion/heading variants. This is not validation across independently generated species. **Foot IK, foot locking, terrain adaptation and automatic visual approval are not implemented.** The new set needs artistic review during play, especially foot contact, turning and one-shot transitions. Different body plans/providers need their own adapters.

### Generate a procedural prototype

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

`lib/creatures/core.ts` owns definition validation, stable content IDs, derived statistics, reference prompts, and the text-authoring contract. Definitions cannot supply arbitrary code, stat overrides, executable effects or asset URLs. The separate generated-asset manifest/loader accepts the worker's validated GLBs; technical acceptance is distinct from visual rig review. Displayed free text is rendered as text by React.

## What the rig exports mean

**Export prototype GLB** produces a binary glTF containing an articulated placeholder, named bones, rigid per-bone skin weights, and idle/walk animation clips. It can be inspected in Blender without purchasing a model-generator subscription. It is not a finished wolf, a Voltfang likeness, or a production-quality organic rig. Feet may slide during the simple walk cycle; no IK or foot locking is claimed.

**Export rig contract** records the procedural plan's ID and revision, meter units, +Y up, +Z forward, model-space rest-joint positions, parent hierarchy, and clip names. **Export reference brief** provides creature identity and neutral-pose constraints. The automated worker generates a reference from source art and requests a body-specific provider rig; it does not transfer these procedural prototype weights onto the detailed mesh.

Production asset stages:

1. Refine and approve the base body's joint placement, proportions, locomotion, and attack clips.
2. Render neutral reference views. Generate creature art around this approved body plan.
3. Generate or model the detailed mesh, preserving the body plan and separating effects from anatomy.
4. Fit geometry and transfer/paint weights. Check shoulders, hips, feet, jaw and tail under motion.
5. Validate GLB scale, hierarchy, clips, skinning, materials, geometry/texture budgets, and behavior in a crowded scene.
6. The automated worker now supplies the manifest/GLB loader with prototype fallback. Exported procedural prototype files do not automatically become production assets; the synthetic fixture used by tests is never shipped in the game library.

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

| Location                            | Responsibility                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `lib/creatures/core.ts`             | Portable schema, taxonomy, validators, deterministic generator, service client           |
| `lib/creatures/actor.ts`            | Prototype bone hierarchy, proxy mesh, weights and clips                                  |
| `app/bastion/creature-forge.tsx`    | In-app authoring, preview, collection and exports                                        |
| `game/creature-forge.js`            | Game bridge, custom species, enemy visuals and animation                                 |
| `scripts/creature-provider.mjs`     | Optional local AI adapter with server-side credentials                                   |
| `scripts/creature-pipeline/`        | Actual Chimera source adapter, Tripo tasks, durable jobs, GLB gate and local HTTP worker |
| `lib/creatures/generated.ts`        | Generated asset manifest, checksum-verified GLB loading and independent runtime skins    |
| `app/bastion/creature-pipeline.tsx` | Worker connection, job progress and automatic selection of installed models              |
| `public/creatures/`                 | Installed generated models, portraits and deployment manifest                            |
| `tests/creatures.test.mjs`          | Validation, determinism, rest-joint positions and mocked provider                        |
| `tests/browser-creatures.cjs`       | Actual UI, GLB export, spawning, save/reload and responsive behavior                     |

Run `npm run test:creatures` and the relevant game suites for schema/rig/runtime changes. Build with `npm run build:standalone`, then run `node tests/browser-creatures.cjs` for UI/GLB/game integration. Tests use a fake provider; they do not spend API credits. Update this document and the in-app wiki alongside changes.
