import { unpackGlb, packGlb } from './animation-gltf.mjs';

// Remove obsolete animation data as well as clip names. Mesh/image bytes are copied verbatim.
export function compactGlb(bytes) {
  const { doc, bin } = unpackGlb(bytes);
  const accessors = [],
    accessorMap = new Map();
  function accessor(i) {
    if (!accessorMap.has(i)) {
      accessorMap.set(i, accessors.length);
      accessors.push(doc.accessors[i]);
    }
    return accessorMap.get(i);
  }
  for (const mesh of doc.meshes || [])
    for (const p of mesh.primitives) {
      for (const attrs of [p.attributes, ...(p.targets || [])])
        for (const k of Object.keys(attrs)) attrs[k] = accessor(attrs[k]);
      if (p.indices !== undefined) p.indices = accessor(p.indices);
    }
  for (const skin of doc.skins || [])
    if (skin.inverseBindMatrices !== undefined)
      skin.inverseBindMatrices = accessor(skin.inverseBindMatrices);
  for (const clip of doc.animations || [])
    for (const s of clip.samplers) {
      s.input = accessor(s.input);
      s.output = accessor(s.output);
    }
  const views = [],
    viewMap = new Map(),
    chunks = [];
  let offset = 0;
  function view(i) {
    if (!viewMap.has(i)) {
      const old = doc.bufferViews[i];
      const data = bin.subarray(
        old.byteOffset || 0,
        (old.byteOffset || 0) + old.byteLength,
      );
      const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
      data.copy(padded);
      viewMap.set(i, views.length);
      views.push({ ...old, buffer: 0, byteOffset: offset });
      chunks.push(padded);
      offset += padded.length;
    }
    return viewMap.get(i);
  }
  for (const a of accessors) {
    if (a.bufferView !== undefined) a.bufferView = view(a.bufferView);
    if (a.sparse)
      for (const k of ['indices', 'values'])
        a.sparse[k].bufferView = view(a.sparse[k].bufferView);
  }
  for (const image of doc.images || [])
    if (image.bufferView !== undefined)
      image.bufferView = view(image.bufferView);
  doc.accessors = accessors;
  doc.bufferViews = views;
  doc.buffers = [{ byteLength: offset }];
  return packGlb(doc, Buffer.concat(chunks));
}
