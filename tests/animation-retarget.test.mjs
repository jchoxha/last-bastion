import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateRiggedGlb } from '../scripts/creature-pipeline/validate.mjs';

function unpack(bytes) {
  const length = bytes.readUInt32LE(12);
  return {
    doc: JSON.parse(bytes.subarray(20, 20 + length)),
    bin: bytes.subarray(28 + length),
  };
}
test('retargeted walk preserves Voltfang geometry, weights, bind pose and original animation', async () => {
  const original = unpack(
    await readFile('public/creatures/asset_77b12bc91500528d69d3194c.glb'),
  );
  const bytes = await readFile(
    'public/creatures/asset_6b400a86fead98a914ab27e7.glb',
  );
  const trial = unpack(bytes);
  for (const key of [
    'nodes',
    'skins',
    'meshes',
    'images',
    'textures',
    'materials',
  ])
    assert.deepEqual(trial.doc[key], original.doc[key], key);
  assert.deepEqual(trial.bin.subarray(0, original.bin.length), original.bin);
  assert.deepEqual(trial.doc.animations[0], original.doc.animations[0]);
  assert.equal(trial.doc.animations.length, 2);
  // Validate the new clip on its own: the original walk must not mask an invalid trial.
  trial.doc.animations = [trial.doc.animations[1]];
  const jsonBytes = Buffer.from(JSON.stringify(trial.doc));
  const json = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 32);
  jsonBytes.copy(json);
  const isolated = Buffer.alloc(28 + json.length + trial.bin.length);
  [0x46546c67, 2, isolated.length, json.length, 0x4e4f534a].forEach((n, i) =>
    isolated.writeUInt32LE(n, i * 4),
  );
  json.copy(isolated, 20);
  isolated.writeUInt32LE(trial.bin.length, 20 + json.length);
  isolated.writeUInt32LE(0x004e4942, 24 + json.length);
  trial.bin.copy(isolated, 28 + json.length);
  const report = await validateRiggedGlb(isolated, 'canine-v1');
  assert.equal(report.bones, 31);
  assert.equal(report.triangles, 18896);
  assert.match(report.clips[0], /Quaternius/);
});
