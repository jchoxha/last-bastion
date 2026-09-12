import validator from 'gltf-validator';
import { PipelineError } from './tripo.mjs';

// Structural validation is automatic. It cannot certify anatomical joint placement.
export async function validateRiggedGlb(bytes, bodyPlan) {
  const fail = (message) => {
    throw new PipelineError(`Asset rejected: ${message}`);
  };
  if (
    bytes.length < 28 ||
    bytes.length > 32 * 1024 * 1024 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    fail('invalid GLB header or file exceeds 32 MiB.');
  const length = bytes.readUInt32LE(12);
  if (
    bytes.readUInt32LE(16) !== 0x4e4f534a ||
    length > 4 * 1024 * 1024 ||
    20 + length > bytes.length
  )
    fail('invalid JSON chunk.');
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
  if ([...(gltf.buffers || []), ...(gltf.images || [])].some((x) => x.uri))
    fail(
      'external/data URI resources are not allowed; embed everything in GLB.',
    );
  if (
    (gltf.extensionsRequired || []).some(
      (x) => !['KHR_materials_unlit', 'KHR_texture_transform'].includes(x),
    )
  )
    fail('unsupported required compression/material extension.');
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    maxIssues: 100,
  });
  if (report.issues.numErrors || report.issues.truncated)
    fail(
      `glTF validation errors (${report.issues.numErrors}); ${report.issues.messages
        .filter((m) => m.severity === 0)
        .slice(0, 3)
        .map((m) => m.code)
        .join(', ')}.`,
    );
  if (!gltf.skins?.length || gltf.skins.length > 8)
    fail('missing skin or too many skins.');
  const bones = new Set(gltf.skins.flatMap((s) => s.joints));
  if (bones.size < (bodyPlan === 'canine-v1' ? 12 : 15) || bones.size > 96)
    fail('bone count is outside the body-plan budget.');
  let triangles = 0,
    primitives = 0,
    vertices = 0,
    weighted = 0;
  for (const node of gltf.nodes || []) {
    if (node.mesh === undefined) continue;
    for (const p of gltf.meshes[node.mesh].primitives) {
      if ((p.mode ?? 4) !== 4) fail('only triangle geometry is supported.');
      const count = gltf.accessors[p.attributes.POSITION].count;
      vertices += count;
      primitives++;
      triangles +=
        (p.indices === undefined ? count : gltf.accessors[p.indices].count) / 3;
      if (
        node.skin !== undefined &&
        p.attributes.JOINTS_0 !== undefined &&
        p.attributes.WEIGHTS_0 !== undefined
      )
        weighted += count;
    }
  }
  if (!vertices || weighted / vertices < 0.9)
    fail('at least 90% of vertices must be skinned.');
  if (triangles > 40000 || primitives > 12 || (gltf.materials?.length || 0) > 8)
    fail(
      'geometry/material budget exceeded (40k triangles, 12 draw primitives, 8 materials).',
    );
  if (
    !(gltf.materials || []).some(
      (m) => m.pbrMetallicRoughness?.baseColorTexture,
    )
  )
    fail('textured base-color material is missing.');
  if (
    (report.info?.resources || []).some(
      (r) => r.image && (r.image.width > 2048 || r.image.height > 2048),
    )
  )
    fail('texture exceeds 2048 pixels.');
  const clips = gltf.animations || [];
  if (!clips.length || clips.length > 12)
    fail('missing animations or too many clips.');
  const binaryOffset = 28 + length;
  function changes(animation, channel) {
    const sampler = animation.samplers[channel.sampler];
    const output = gltf.accessors[sampler.output],
      view = gltf.bufferViews[output.bufferView];
    if (!view || output.sparse || output.componentType !== 5126) return false;
    const count = gltf.accessors[sampler.input].count,
      components = channel.target.path === 'rotation' ? 4 : 3;
    const stride = view.byteStride || components * 4;
    const offset =
      binaryOffset + (view.byteOffset || 0) + (output.byteOffset || 0);
    const index = (frame) =>
      sampler.interpolation === 'CUBICSPLINE' ? frame * 3 + 1 : frame;
    for (let frame = 1; frame < count; frame++)
      for (let axis = 0; axis < components; axis++) {
        if (
          Math.abs(
            bytes.readFloatLE(offset + index(frame) * stride + axis * 4) -
              bytes.readFloatLE(offset + index(0) * stride + axis * 4),
          ) > 0.00001
        )
          return true;
      }
    return false;
  }
  const walkClip = clips.findIndex(
    (animation) =>
      new Set(
        animation.channels
          .filter(
            (channel) =>
              bones.has(channel.target.node) &&
              ['rotation', 'translation'].includes(channel.target.path) &&
              changes(animation, channel),
          )
          .map((channel) => channel.target.node),
      ).size >= 4,
  );
  if (walkClip < 0)
    fail('locomotion must animate at least four skeleton joints.');
  return {
    triangles,
    vertices,
    bones: bones.size,
    primitives,
    clips: clips.map((a, i) => a.name || `animation-${i}`),
    walkClip,
    warnings: report.issues.numWarnings,
    visualReview: 'unverified',
  };
}
