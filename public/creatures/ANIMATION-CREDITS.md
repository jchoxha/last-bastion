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

The shared **Quaternius wolf walk — canine profile trial** uses the same CC0
Wolf / Walk source. Its animation-only glTF (Walk channels/accessors and node
transforms, without meshes, materials or other clips) is bundled at
`scripts/creature-pipeline/animations/quaternius-wolf-walk.gltf`.
Derived-file SHA-256: `b30d0d36387f1768c9af27ddcff627efc6104cc3561e2d1c160c72e328c06ffe`.
This permits offline reuse in generation jobs without external downloads.
Use `scripts/creature-pipeline/retarget.mjs INPUT.glb OUTPUT.glb [CALIBRATION.json]`
for compatible Tripo canines. The manifest records the profile revision,
source checksum, optional head calibration and review diagnostics. No creature
identity or target hash is required by this shared profile. Both retargeted trials
remain previews; the first script is retained for historical reproducibility.

The canine profile v2 trial also includes Last Bastion’s procedural head and tail
secondary motion, layered over the Quaternius walk. These additions are not part
of the donor animation; their settings are recorded in the asset manifest.
