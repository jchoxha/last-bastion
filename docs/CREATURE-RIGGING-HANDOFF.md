# Creature rigging handoff

Updated: September 15, 2026

This is the implementation handoff for generated-creature rigging. It records confirmed behavior and the next build, rather than treating provider output as a finished animation system. Read this with [CREATURE-PIPELINE.md](CREATURE-PIPELINE.md) before changing provider calls, animation adapters, or installation.

## Objective

Every accepted generated creature must automatically use the tested motion library for its body family. It may be published only after structural and deformation checks pass. A provider result marked `riggable`, `biped`, or technically valid GLB is not sufficient proof of usable animation.

The intended solution is a **canonical rebind**, not an attempt to repair an AI provider skeleton:

1. Generate card art and a neutral modeling reference from a structured body plan.
2. Use Tripo for the textured mesh.
3. Discard the Tripo armature and bind the mesh to Last Bastion's canonical skeleton for that body family.
4. Attach clips authored for that exact skeleton.
5. Run automated structural and motion checks before publishing.

Start with `humanoid-v1`. Compatible canines already have an independent 26-clip adapter. Other body families require their own canonical skeleton, skinning profile, animation library, and test suite; do not claim they are already automatic.

## Current state

| Area | Confirmed state |
| --- | --- |
| Card art → low-poly reference → Tripo mesh/texture | Automated through GitHub Actions and the local worker. |
| Tripo rig check | Necessary but insufficient; it reports a broad requested category, not a usable animation hierarchy. |
| Canine motion | Compatible rigs receive 26 shared clips through `animation-set.mjs` and `retarget-canine.mjs`. |
| Humanoid motion | A complete provider contract receives one safe rotation-only walk from `retarget-humanoid.mjs`. The previous generic UAL retargeter was reverted after visual failure. |
| Publication | Atomic and fail-closed. A rejected rig stays in the workflow artifact and is never added to `public/creatures/index.json`. |

## Ironhide: the tail-free test

The owner supplied Ironhide art and requested a weapon-free, tail-free modeling reference. The approved inputs are:

- `public/creatures/pipeline-inputs/ironhide-card-v1.png`
- `public/creatures/pipeline-inputs/ironhide-spec-v1.png`
- `public/creatures/pipeline-inputs/ironhide.json`

GitHub Actions [run 34999131957](https://github.com/jchoxha/last-bastion/actions/runs/34999131957) used the packaged specification, so no extra image-generation task ran. Tripo reported the model as a biped, but its rig could not meet the humanoid motion contract:

- Job: `job_7c1a39d3ae72f738af7308dc`
- Mesh task: `dc21b280-9485-4c18-ac59-2b5cef6fb16d`
- Rig task: `b32238bb-2af8-4b09-b27f-980d555471f3`
- Exact rejection: required right-leg joint `tripo::1_Right_Limb_1` was absent; the remaining right-leg helper bones were disconnected from a hip–knee–ankle chain.

This shows the tail was not the primary cause of Cinderbound's bad humanoid motion. A disconnected leg chain cannot be repaired by renaming bones or retargeting clips. The failed workflow retains the mesh and rig for 30 days. Do not use GitHub's **Re-run jobs** button: this project rejects it to avoid duplicate paid work.

Commit `0d140e7` changes this failure from a generic validation crash into an explicit no-install reason and covers it with a regression test.

## Do not restore the old humanoid retargeter

Commit `8d7455b` attempted to map the 65-bone UAL library onto a generated Tripo rig and was reverted in `59cd3bf`. Matching broad roles did not make local axes, rest orientation, helper bones, limb lengths, and feet compatible. The tail made its own donor-driven motion static, but it did not cause the broken feet and arms.

Do not expand `retarget-humanoid.mjs` into a generic UAL retargeter. It is intentionally a narrow, safe-walk adapter while canonical rebind work is pending.

## Canonical humanoid rebind

Use the verified UAL2 humanoid hierarchy as the `humanoid-v1` template because the existing motion set already targets it. Its names, parent hierarchy, local axes, and rest-pose conventions are the contract. Per-creature profiles may scale bone lengths, but must not change that contract.

Run a pinned Blender release headlessly after mesh generation, ideally inside the GitHub Action. The worker should have no provider key and should keep its input, output, and report in the existing durable job directory.

1. **Prepare mesh.** Import Tripo mesh, remove its armature/weights/animations, apply transforms, preserve materials/textures, weld duplicate vertices, and remove degenerate geometry.
2. **Fit skeleton.** Use a validated `morphProfile` selected before art generation: height, shoulder and hip width, torso, arm and leg length, head scale, stance, and optional tail length. Prompts must request a front-facing neutral A-pose with separated limbs and no weapons/effects.
3. **Build a skinning proxy.** Generate a closed low-resolution voxel proxy. Bind it to the fitted canonical skeleton with Blender automatic bone-heat weights.
4. **Transfer weights.** Transfer proxy vertex groups to the original textured mesh by nearest-surface interpolation. Normalize, prune to four influences, and rigidly bind armor/accessory islands to the nearest intended body bone.
5. **Fallback or reject.** If bone heat fails, use deterministic distance-to-bone weights, blended at joints. Reject the result if a major limb has no meaningful weighted region; never attach failed geometry entirely to the root.
6. **Export clips.** Export GLB with embedded resources and the canonical skeleton, then attach the existing UAL2 clips. Adjust only verified root-motion scale; do not retarget arbitrary local rotations from a foreign skeleton.

## Required gates

The rebind worker must emit JSON and reject when any of these fail:

- canonical names, parent relationships, and local axes match `humanoid-v1`;
- every vertex has normalized weights with at most four influences;
- pelvis, spine, head, both arms, and both legs own non-trivial weighted regions;
- current GLB resource, texture, triangle, and file-size budgets pass;
- idle, walk, run, attack, hit, death, and turn are sampled at fixed frames;
- sampled motion has no empty limb, unchanged required head/limb, excessive vertex displacement, or ground penetration beyond tolerance;
- a contact sheet and report are retained with the job artifact.

This cannot certify attractive anatomy. It makes bad output measurable, recoverable, and unpublishable; the forge remains the final visual review surface.

## Build order

1. Extract and version the UAL2 armature plus walk, idle, run, attack, hit, death, and turn clips as `humanoid-v1`.
2. Implement a local Blender proof against Ironhide's retained mesh. It must produce a GLB and report without a Tripo call or publishing.
3. Add fixed-frame contact-sheet tests for diverse humanoid meshes, including deliberately broken weights and skeletons.
4. Add hierarchy, weighting, and deformation gates.
5. Insert the headless worker into GitHub Actions; publish only after its gates pass.
6. Validate a diverse humanoid batch before enabling automatic production installation.
7. Repeat separately for each other body family.

## Relevant files

| Location | Responsibility |
| --- | --- |
| `scripts/creature-pipeline/jobs.mjs` | Durable stages, provider calls, validation, atomic install, and manifest updates. |
| `scripts/creature-pipeline/animation-set.mjs` | Body-plan animation dispatch and explicit humanoid incompatibility reporting. |
| `scripts/creature-pipeline/retarget-humanoid.mjs` | Current safe one-walk adapter and strict provider-contract check. |
| `scripts/creature-pipeline/validate.mjs` | GLB resource, skin, texture, triangle, and animation checks. |
| `scripts/creature-pipeline/rig-profiles.mjs` | Pattern for versioned motion contracts. |
| `app/bastion/creature-forge.tsx` | Forge inspection and test-spawn entry point. |

## Non-goals and guardrails

- Do not change Chimera Cards.
- Do not put provider keys in the browser or repository.
- Do not install a model because Tripo says it is `riggable`.
- Do not spend credits retrying Ironhide until the offline canonical-rebind proof is ready.
- Do not represent imported motion kits as automatic compatibility for all creature families.
