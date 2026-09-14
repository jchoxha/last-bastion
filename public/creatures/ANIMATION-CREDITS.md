# Animation sources

## DIMOS / Lost Ark wolf

The primary canine library uses the 18 animations from **Wolf**, extracted and
published by **DIMOS** (listed as `:Dim0s`) on
[p3dm.ru](https://p3dm.ru/files/beasts/20003-wolfs.html). The repository owner
reports receiving direct permission from DIMOS on September 14, 2026 to use and
license these animations in Last Bastion. Keep that correspondence with the
project's private rights records; it is not committed to this public repository.

The source page identifies the original game as **Lost Ark**. This repository
records the permission basis as reported by the project owner and does not make
a broader claim about the source files outside this project.

Source clips: `att_battle_1_01`, `att_battle_2_01`,
`evt2_idle_normal_1`, `evt2_run_01`, `evt2_run_battle_1`,
`evt2_sc_absurd_loop_1`, `evt2_walk_normal_1`, `idle_normal_1`,
`idle_normal_1.001`, `idle_normal_1_1`, `idle_normal_1_1.001`, `on`,
`run_normal_1`, `sc_greet_1`, `sc_greet_2`, `sc_talk_1`, `sk_howling` and
`sk_moving`.

Only animation data and donor skeleton transforms are bundled. The donor mesh,
textures and materials are excluded. Generated creatures retain their own mesh,
textures, skeleton and skin weights.

Bundled animation-only donor:
`scripts/creature-pipeline/animations/dimos-lost-ark-wolf-actions.glb`

SHA-256:
`37bb55237896c6cad81c47b718729df28062153f4364c65484eacdaf73f705d9`

## Quaternius fallback motions

Hit, death, stagger, jump and landing still derive from **Wolf**, by
**Quaternius**, in the
[Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html),
released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Last Bastion supplies the three procedural pivot clips. The Quaternius source
was retrieved September 13, 2026 through the author's linked Google Drive folder.

Fallback clips: `Death`, `Idle_HitReact1`, `Idle_HitReact2`, `Gallop_Jump` and
`Jump_ToIdle`.

Bundled `scripts/creature-pipeline/animations/quaternius-wolf-actions.gltf`
SHA-256:
`90001d38562205c58cea21cf355a540ad2c595c5c1997be20497a42f87c7289f`.

The earlier isolated Quaternius walk and historical retarget experiments remain
as regression fixtures. They are not used by the current published Voltfang.

Reproduce the current set with
`scripts/creature-pipeline/retarget.mjs INPUT.glb OUTPUT.glb [CALIBRATION.json]`.
The adapter works with compatible Tripo canine rigs and does not depend on a
specific creature ID or target hash. Foot contact still requires visual review.
