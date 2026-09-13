# Animation sources

Voltfang's optional **Quaternius wolf walk — retargeted trial** derives from
**Wolf / Walk**, by **Quaternius**, in the
[Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html).
The author releases the pack under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Source retrieved September 13, 2026 through the author's linked Google Drive folder.

Only retargeted animation data is included. Voltfang's mesh, textures, bones and
skin weights remain the original Tripo output. The source wolf model is not shipped.

Pinned source file: `Wolf.gltf`, SHA-256
`cc02e9d128b5715f352ee8bea086f97a35f1d875d240de99b0f9f2775c37d415`.

Reproduce the trial with `scripts/creature-pipeline/retarget-voltfang.mjs`.
It requires that source file and the preserved original
`asset_77b12bc91500528d69d3194c.glb`. The script validates its output and writes
only the requested output file; it does not install a model or call a provider.

This is an experimental comparison clip. It needs foot-contact and deformation
review and is not the default gameplay walk.
