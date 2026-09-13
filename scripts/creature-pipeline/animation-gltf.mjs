import * as THREE from 'three';
import { RigCompatibilityError } from './rig-profiles.mjs';

export function unpackGlb(bytes) {
  if (
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw new RigCompatibilityError('Expected a GLB 2.0 asset.');
  const length = bytes.readUInt32LE(12);
  return {
    doc: JSON.parse(bytes.subarray(20, 20 + length)),
    bin: bytes.subarray(28 + length),
  };
}
export function packGlb(doc, binary) {
  const text = Buffer.from(JSON.stringify(doc));
  const json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(json);
  const bin = Buffer.alloc(Math.ceil(binary.length / 4) * 4);
  binary.copy(bin);
  const result = Buffer.alloc(28 + json.length + bin.length);
  [0x46546c67, 2, result.length, json.length, 0x4e4f534a].forEach((v, i) =>
    result.writeUInt32LE(v, i * 4),
  );
  json.copy(result, 20);
  result.writeUInt32LE(bin.length, 20 + json.length);
  result.writeUInt32LE(0x004e4942, 24 + json.length);
  bin.copy(result, 28 + json.length);
  return result;
}
export function hierarchy(doc) {
  const nodes = doc.nodes.map((node, i) => {
    if (
      node.matrix ||
      (node.scale &&
        (node.scale.some((v) => v <= 0) ||
          Math.max(...node.scale) - Math.min(...node.scale) >
            Math.max(...node.scale) * 1e-4))
    )
      throw new RigCompatibilityError(
        'Expected TRS nodes with positive uniform scale.',
      );
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
export function values(doc, bin, index) {
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
export function appendClip(
  targetDoc,
  targetBin,
  times,
  samples,
  rootIndex,
  positions,
  name,
) {
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
    name,
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
  channel(rootIndex, 'translation', positions, 'VEC3');
  targetDoc.animations ||= [];
  targetDoc.animations.push(out);
  targetDoc.buffers[0].byteLength = byteLength;
  return packGlb(targetDoc, Buffer.concat(chunks));
}
