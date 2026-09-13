# Animation sources

The shared canine animation set derives from **Wolf**, by **Quaternius**, in the
[Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html),
released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Source retrieved September 13, 2026 through the author's linked Google Drive folder.

Source clips: Walk, Idle, Gallop, Attack, Death, Idle_HitReact1,
Idle_HitReact2, Gallop_Jump and Jump_ToIdle. Charge reuses Gallop; leap and jump
reuse Gallop_Jump. Last Bastion supplies the retargeting, calibrated head/tail
corrections, walk secondary motion, procedural pivots, cast and spawn.

Only animation data and donor node transforms are bundled. The source wolf mesh
is not shipped. Generated creatures retain their own mesh, textures, skeleton
and skin weights. The latest corrected v3 walk is the sole walk in the full set;
older asset renditions are regression fixtures under `tests/fixtures/creatures/`,
not published assets. The set still needs artistic review, particularly foot contact.

Original `Wolf.gltf` SHA-256:
`cc02e9d128b5715f352ee8bea086f97a35f1d875d240de99b0f9f2775c37d415`.

Bundled `scripts/creature-pipeline/animations/quaternius-wolf-actions.gltf` SHA-256:
`90001d38562205c58cea21cf355a540ad2c595c5c1997be20497a42f87c7289f`.

The earlier isolated `quaternius-wolf-walk.gltf` remains the exact v3 walk donor:
`b30d0d36387f1768c9af27ddcff627efc6104cc3561e2d1c160c72e328c06ffe`.

Reproduce a full set with
`scripts/creature-pipeline/retarget.mjs INPUT.glb OUTPUT.glb [CALIBRATION.json]`.
The reusable adapter requires a compatible Tripo canine rig, not a creature ID
or target hash. Generation jobs use it offline without extra provider calls.
The historical `retarget-voltfang.mjs` remains only for reproducing the first
comparison from its pinned source and original target fixture.
