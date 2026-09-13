import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { CREATURE_MOTIONS } from '../lib/creatures/motions.ts';
import { buildAnimationSet } from '../scripts/creature-pipeline/animation-set.mjs';
import {
  unpackGlb,
  values,
} from '../scripts/creature-pipeline/animation-gltf.mjs';

test('full set keeps the latest walk exactly, drops old walks, and gives every role a valid clip', async () => {
  const original = await readFile(
    'tests/fixtures/creatures/asset_5e52d8f0e5c7b0eba09dd923.glb',
  );
  const result = await buildAnimationSet(original, 'canine-v1', {
    headYawDegrees: -10,
  });
  assert.equal(result.report.status, 'animation-set');
  assert.equal(result.report.revision, 3);
  assert.ok(result.report.tailCalibration);
  assert.ok(result.report.diagnostics.attack.feet);
  assert.ok(result.report.warnings.some((w) => w.includes('foot locking')));
  const a = unpackGlb(original),
    b = unpackGlb(result.bytes);
  assert.deepEqual(
    b.doc.animations.map((c) => c.name),
    Object.keys(CREATURE_MOTIONS),
  );
  assert.equal(b.doc.animations.filter((c) => /walk/i.test(c.name)).length, 1);
  assert.deepEqual(b.doc.nodes, a.doc.nodes);
  assert.deepEqual(b.doc.materials, a.doc.materials);
  function sameView(i, j) {
    const x = a.doc.bufferViews[i],
      y = b.doc.bufferViews[j];
    assert.deepEqual(
      a.bin.subarray(x.byteOffset || 0, (x.byteOffset || 0) + x.byteLength),
      b.bin.subarray(y.byteOffset || 0, (y.byteOffset || 0) + y.byteLength),
    );
  }
  function sameAccessor(i, j) {
    const { bufferView: x, ...old } = a.doc.accessors[i];
    const { bufferView: y, ...next } = b.doc.accessors[j];
    assert.deepEqual(next, old);
    sameView(x, y);
  }
  for (let m = 0; m < a.doc.meshes.length; m++) {
    for (let p = 0; p < a.doc.meshes[m].primitives.length; p++) {
      const x = a.doc.meshes[m].primitives[p],
        y = b.doc.meshes[m].primitives[p];
      for (const key of Object.keys(x.attributes))
        sameAccessor(x.attributes[key], y.attributes[key]);
      if (x.indices !== undefined) sameAccessor(x.indices, y.indices);
    }
  }
  for (let i = 0; i < a.doc.skins.length; i++)
    sameAccessor(
      a.doc.skins[i].inverseBindMatrices,
      b.doc.skins[i].inverseBindMatrices,
    );
  for (let i = 0; i < a.doc.images.length; i++)
    sameView(a.doc.images[i].bufferView, b.doc.images[i].bufferView);
  const before = a.doc.animations.at(-1),
    after = b.doc.animations.find((c) => c.name === 'walk');
  for (let i = 0; i < before.channels.length; i++) {
    const old = before.samplers[before.channels[i].sampler],
      next = after.samplers[after.channels[i].sampler];
    assert.deepEqual(
      values(a.doc, a.bin, old.input),
      values(b.doc, b.bin, next.input),
    );
    assert.deepEqual(
      values(a.doc, a.bin, old.output),
      values(b.doc, b.bin, next.output),
    );
  }
  for (const clip of b.doc.animations.filter((c) => c.extras.loop))
    for (const c of clip.channels.filter((c) => c.target.path === 'rotation')) {
      const v = values(b.doc, b.bin, clip.samplers[c.sampler].output);
      assert.ok(
        new THREE.Quaternion()
          .fromArray(v)
          .normalize()
          .angleTo(
            new THREE.Quaternion().fromArray(v, v.length - 4).normalize(),
          ) < 1e-4,
        clip.name + ' loop seam',
      );
    }
  assert.equal(
    b.doc.animations.find((c) => c.name === 'attack').extras.impactFraction,
    0.4,
  );
  assert.ok(
    result.bytes.length < original.length + 1024 * 1024,
    'set stays within a modest asset budget',
  );
});
