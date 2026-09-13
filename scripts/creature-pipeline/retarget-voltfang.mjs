// An offline, asset-specific experiment. No provider calls or automatic installation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { validateRiggedGlb } from './validate.mjs';

const sourcePath = process.argv[2];
const targetPath = process.argv[3];
const outputPath = process.argv[4];
if (!sourcePath || !targetPath || !outputPath)
  throw Error(
    'Usage: node scripts/creature-pipeline/retarget-voltfang.mjs source.gltf original.glb output.glb',
  );

if (
  [sourcePath, targetPath].some(
    (input) => path.resolve(input) === path.resolve(outputPath),
  )
)
  throw Error('Output must not overwrite either input asset.');
const sourceBytes = await fs.readFile(sourcePath);
const sourceDoc = JSON.parse(sourceBytes);
const targetBytes = await fs.readFile(targetPath);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (
  sha(sourceBytes) !==
    'cc02e9d128b5715f352ee8bea086f97a35f1d875d240de99b0f9f2775c37d415' ||
  sha(targetBytes) !==
    '77b12bc91500528d69d3194c3d2cd1ac6f0a5a68f4f9517c085f0231fce2641b'
)
  throw Error(
    'This mapping is verified only against the pinned Quaternius wolf and original Voltfang assets.',
  );
const jsonLength = targetBytes.readUInt32LE(12);
const targetDoc = JSON.parse(targetBytes.subarray(20, 20 + jsonLength));
const targetBin = targetBytes.subarray(28 + jsonLength);
const sourceBin = Buffer.from(sourceDoc.buffers[0].uri.split(',')[1], 'base64');

function hierarchy(doc) {
  const nodes = doc.nodes.map((node, i) => {
    const obj = new THREE.Object3D();
    obj.name = `node${i}`;
    obj.position.fromArray(node.translation || [0, 0, 0]);
    obj.quaternion.fromArray(node.rotation || [0, 0, 0, 1]);
    obj.scale.fromArray(node.scale || [1, 1, 1]);
    return obj;
  });
  doc.nodes.forEach((node, i) =>
    node.children?.forEach((child) => nodes[i].add(nodes[child])),
  );
  const root = new THREE.Group();
  nodes.filter((node) => !node.parent).forEach((node) => root.add(node));
  root.updateMatrixWorld(true);
  return {
    root,
    nodes,
    byName: new Map(doc.nodes.map((node, i) => [node.name, nodes[i]])),
    rest: nodes.map((node) => ({
      position: node.getWorldPosition(new THREE.Vector3()),
      quaternion: node.getWorldQuaternion(new THREE.Quaternion()),
    })),
  };
}
function values(doc, bin, index) {
  const accessor = doc.accessors[index],
    view = doc.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  if (accessor.componentType !== 5126 || accessor.sparse || !components)
    throw Error('Unsupported animation accessor.');
  return Array.from({ length: accessor.count * components }, (_, i) =>
    bin.readFloatLE(
      (view.byteOffset || 0) +
        (accessor.byteOffset || 0) +
        Math.floor(i / components) * (view.byteStride || components * 4) +
        (i % components) * 4,
    ),
  );
}
const source = hierarchy(sourceDoc),
  target = hierarchy(targetDoc);
const animation = sourceDoc.animations.find((clip) => clip.name === 'Walk');
if (!animation) throw Error('Wolf source has no Walk clip.');
const tracks = animation.channels.map((channel) => {
  const sampler = animation.samplers[channel.sampler];
  if (sampler.interpolation && sampler.interpolation !== 'LINEAR')
    throw Error('Expected baked linear animation.');
  const property = {
    translation: 'position',
    rotation: 'quaternion',
    scale: 'scale',
  }[channel.target.path];
  const Track =
    property === 'quaternion'
      ? THREE.QuaternionKeyframeTrack
      : THREE.VectorKeyframeTrack;
  return new Track(
    `node${channel.target.node}.${property}`,
    values(sourceDoc, sourceBin, sampler.input),
    values(sourceDoc, sourceBin, sampler.output),
  );
});
const clip = new THREE.AnimationClip('Walk', -1, tracks);
const mixer = new THREE.AnimationMixer(source.root);
const action = mixer.clipAction(clip).play();
const mapping = {
  'tripo::Root': 'Body',
  'tripo::Spine_0': 'Back',
  'tripo::Spine_1': 'Torso',
  'tripo::Spine_2': 'Torso2',
  'tripo::Spine_3': 'Torso3',
  'tripo::Head_0': 'Neck1',
  'tripo::Head_1': 'Neck3',
  'tripo::Head_2': 'Head',
  'tripo::0_Left_Limb_0': 'FrontUpperLeg.L',
  'tripo::0_Left_Limb_1': 'FrontLowerLeg.L',
  'tripo::0_Right_Limb_0': 'FrontUpperLeg.R',
  'tripo::0_Right_Limb_1': 'FrontLowerLeg.R',
  'tripo::1_Left_Limb_0': 'BackLeg.L',
  'tripo::1_Left_Limb_1': 'BackUpperLeg.L',
  'tripo::1_Left_Limb_2': 'BackLowerLeg.L',
  'tripo::1_Right_Limb_0': 'BackLeg.R',
  'tripo::1_Right_Limb_1': 'BackUpperLeg.R',
  'tripo::1_Right_Limb_2': 'BackLowerLeg.R',
  bone_29: 'BackShoulder.L',
  bone_30: 'BackShoulder.R',
  bone_24: 'Tail1',
  bone_25: 'Tail3',
  bone_26: 'Tail5',
  'tripo::Tail_0': 'Tail7',
  'tripo::Tail_1': 'Tail8',
};
const pairs = Object.entries(mapping).map(([targetName, sourceName]) => {
  const to = target.byName.get(targetName),
    from = source.byName.get(sourceName);
  if (!to || !from)
    throw Error(`Missing mapped bone: ${targetName} / ${sourceName}`);
  return {
    to,
    from,
    ti: target.nodes.indexOf(to),
    si: source.nodes.indexOf(from),
  };
});
// Donor faces +Z, Voltfang faces +X. Transfer world-space rotation deltas,
// then recover locals under the target hierarchy; copying local quaternions is incorrect.
const alignment = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  Math.PI / 2,
);
const inverseAlignment = alignment.clone().invert();
const targetRoot = target.byName.get('tripo::Root');
const rootPair = pairs.find((pair) => pair.to === targetRoot);
const scale =
  target.byName
    .get('tripo::1_Left_Limb_0')
    .getWorldPosition(new THREE.Vector3()).y /
  source.byName.get('BackLeg.L').getWorldPosition(new THREE.Vector3()).y;
const frameCount = Math.ceil(clip.duration * 30);
const times = Array.from(
  { length: frameCount + 1 },
  (_, i) => (i * clip.duration) / frameCount,
);
const samples = new Map(pairs.map((pair) => [pair.ti, []]));
const positions = [];
for (const time of times) {
  action.time = time;
  mixer.update(0);
  source.root.updateMatrixWorld(true);
  const desired = new Map(
    pairs.map((pair) => {
      const delta = pair.from
        .getWorldQuaternion(new THREE.Quaternion())
        .multiply(source.rest[pair.si].quaternion.clone().invert());
      return [
        pair.to,
        alignment
          .clone()
          .multiply(delta)
          .multiply(inverseAlignment)
          .multiply(target.rest[pair.ti].quaternion),
      ];
    }),
  );
  const position = rootPair.from
    .getWorldPosition(new THREE.Vector3())
    .sub(source.rest[rootPair.si].position)
    .applyQuaternion(alignment)
    .multiplyScalar(scale)
    .add(target.rest[rootPair.ti].position);
  targetRoot.position.copy(targetRoot.parent.worldToLocal(position));
  target.root.traverse((node) => {
    if (desired.has(node))
      node.quaternion.copy(
        node.parent
          .getWorldQuaternion(new THREE.Quaternion())
          .invert()
          .multiply(desired.get(node)),
      );
    node.updateMatrixWorld(true);
  });
  for (const pair of pairs)
    samples.get(pair.ti).push(...pair.to.quaternion.toArray());
  positions.push(...targetRoot.position.toArray());
}
const chunks = [targetBin];
let byteLength = targetBin.length;
function append(data, type) {
  const bytes = Buffer.alloc(data.length * 4);
  data.forEach((value, i) => bytes.writeFloatLE(value, i * 4));
  const view =
    targetDoc.bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: bytes.length,
    }) - 1;
  chunks.push(bytes);
  byteLength += bytes.length;
  return (
    targetDoc.accessors.push({
      bufferView: view,
      componentType: 5126,
      count: data.length / (type === 'VEC4' ? 4 : type === 'VEC3' ? 3 : 1),
      type,
      ...(type === 'SCALAR' ? { min: [data[0]], max: [data.at(-1)] } : {}),
    }) - 1
  );
}
const input = append(times, 'SCALAR');
const out = {
  name: 'Quaternius wolf walk — retargeted trial',
  samplers: [],
  channels: [],
};
function channel(node, property, data, type) {
  out.channels.push({
    sampler: out.samplers.length,
    target: { node, path: property },
  });
  out.samplers.push({
    input,
    output: append(data, type),
    interpolation: 'LINEAR',
  });
}
for (const [node, rotations] of samples)
  channel(node, 'rotation', rotations, 'VEC4');
channel(rootPair.ti, 'translation', positions, 'VEC3');
targetDoc.animations.push(out);
targetDoc.buffers[0].byteLength = byteLength;
const text = Buffer.from(JSON.stringify(targetDoc));
const json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
text.copy(json);
const binary = Buffer.concat(chunks);
const result = Buffer.alloc(28 + json.length + binary.length);
[0x46546c67, 2, result.length, json.length, 0x4e4f534a].forEach((value, i) =>
  result.writeUInt32LE(value, i * 4),
);
json.copy(result, 20);
result.writeUInt32LE(binary.length, 20 + json.length);
result.writeUInt32LE(0x004e4942, 24 + json.length);
binary.copy(result, 28 + json.length);
const report = await validateRiggedGlb(result, 'canine-v1');
await fs.writeFile(outputPath, result);
console.log(JSON.stringify({ sourceDuration: clip.duration, ...report }));
