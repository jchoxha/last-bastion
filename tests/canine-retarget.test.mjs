import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { retargetCanine } from '../scripts/creature-pipeline/retarget-canine.mjs';
import { prepareAnimationTrial } from '../scripts/creature-pipeline/animation-trial.mjs';
import {
  unpackGlb,
  packGlb,
  hierarchy,
  values,
} from '../scripts/creature-pipeline/animation-gltf.mjs';
const original = await readFile(
  'public/creatures/asset_77b12bc91500528d69d3194c.glb',
);
const donor = JSON.parse(
  await readFile(
    'scripts/creature-pipeline/animations/quaternius-wolf-walk.gltf',
  ),
);

test('canine profile maps all paw controls while preserving skin, bind pose and source clip', async () => {
  const result = await prepareAnimationTrial(original, 'canine-v1');
  assert.equal(result.report.status, 'preview-only');
  const a = unpackGlb(original),
    b = unpackGlb(result.bytes);
  for (const key of [
    'nodes',
    'skins',
    'meshes',
    'materials',
    'textures',
    'images',
  ])
    assert.deepEqual(b.doc[key], a.doc[key]);
  assert.deepEqual(b.bin.subarray(0, a.bin.length), a.bin);
  assert.deepEqual(b.doc.animations[0], a.doc.animations[0]);
  const names = b.doc.animations[1].channels.map(
    (c) => b.doc.nodes[c.target.node].name,
  );
  for (const side of ['Left', 'Right'])
    for (const end of ['0', '1'])
      for (const i of [2, 3])
        assert.ok(names.includes(`tripo::${end}_${side}_Limb_${i}`));
  assert.match(result.report.warnings.join(' '), /Head facing is uncalibrated/);
});

test('retargeting follows scale, heading and altered limb proportions without target hashes', () => {
  const base = retargetCanine(donor, original);
  for (const [scale, yaw] of [
    [0.5, 0.7],
    [2, -1.2],
  ]) {
    const { doc, bin } = unpackGlb(original);
    const root = doc.nodes.find((n) => n.name === 'Armature');
    root.scale = [scale, scale, scale];
    root.rotation = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .toArray();
    root.translation = [2, 4, -3];
    const r = retargetCanine(donor, packGlb(doc, bin));
    assert.ok(
      Math.abs(r.report.rootMotionScale / base.report.rootMotionScale - scale) <
        1e-5,
    );
    for (const role of Object.keys(r.report.feet)) {
      assert.ok(
        Math.abs(
          r.report.feet[role].excursion / base.report.feet[role].excursion -
            scale,
        ) < 1e-4,
      );
      assert.ok(r.report.feet[role].loopPositionError < 1e-5);
    }
  }
  const { doc, bin } = unpackGlb(original);
  for (const n of doc.nodes)
    if (/0_(Left|Right)_Limb_[123]$/.test(n.name))
      n.translation = n.translation.map((v) => v * 1.25);
  const changed = retargetCanine(donor, packGlb(doc, bin));
  assert.ok(
    changed.report.legLengths.frontLeft >
      base.report.legLengths.frontLeft * 1.24,
  );
  const before = hierarchy(doc),
    after = unpackGlb(changed.bytes),
    pose = hierarchy(after.doc);
  const animation = after.doc.animations.at(-1);
  for (const c of animation.channels) {
    const v = values(
      after.doc,
      after.bin,
      animation.samplers[c.sampler].output,
    );
    const components = c.target.path === 'rotation' ? 4 : 3;
    pose.nodes[c.target.node][
      c.target.path === 'rotation' ? 'quaternion' : 'position'
    ].fromArray(v, components * 10);
  }
  pose.root.updateMatrixWorld(true);
  for (let i = 0; i < pose.nodes.length; i++) {
    const p = pose.nodes[i],
      b = before.nodes[i];
    if (!p.parent || !before.nodes.includes(b.parent)) continue;
    const distance = (n) =>
      n
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(n.parent.getWorldPosition(new THREE.Vector3()));
    if (after.doc.nodes[i].name === 'tripo::Root') continue;
    assert.ok(
      Math.abs(distance(p) - distance(b)) < 1e-5,
      'animated bones retain segment lengths',
    );
  }
});

test('head calibration changes head tracks only, leaving geometry and gait intact', () => {
  const a = unpackGlb(retargetCanine(donor, original).bytes),
    b = unpackGlb(
      retargetCanine(donor, original, { headYawDegrees: 15 }).bytes,
    );
  assert.deepEqual(a.doc.nodes, b.doc.nodes);
  let changed = 0;
  for (let i = 0; i < a.doc.animations[1].channels.length; i++) {
    const c = a.doc.animations[1].channels[i];
    const av = values(
      a.doc,
      a.bin,
      a.doc.animations[1].samplers[c.sampler].output,
    );
    const bv = values(
      b.doc,
      b.bin,
      b.doc.animations[1].samplers[c.sampler].output,
    );
    if (a.doc.nodes[c.target.node].name.includes('Head')) {
      if (av.some((v, j) => Math.abs(v - bv[j]) > 1e-6)) changed++;
    } else assert.deepEqual(av, bv);
  }
  assert.ok(changed > 0);
});

test('missing, ambiguous, disconnected or unsupported rigs cannot receive an animation by guesswork', async () => {
  for (const change of [
    (d) => {
      d.nodes.find((n) => n.name === 'tripo::Head_0').name = 'unknown';
    },
    (d) => {
      d.nodes.push({ name: 'tripo::Head_0' });
    },
    (d) => {
      d.nodes.find((n) => n.name === 'tripo::Head_0').children = [];
    },
    (d) => {
      d.nodes.find((n) => n.name === 'Armature').scale = [1, 2, 1];
    },
  ]) {
    const { doc, bin } = unpackGlb(original);
    change(doc);
    const bytes = packGlb(doc, bin);
    const r = await prepareAnimationTrial(bytes, 'canine-v1');
    assert.equal(r.report.status, 'skipped');
    assert.equal(r.bytes, bytes);
    assert.ok(r.report.reason);
  }
  assert.equal(
    (await prepareAnimationTrial(original, 'humanoid-v1')).report.status,
    'skipped',
  );
  assert.throws(
    () => retargetCanine(donor, original, { headYawDegrees: NaN }),
    /Calibration/,
  );
  assert.throws(
    () => retargetCanine(donor, original, { headYawDegrees: 90 }),
    /Calibration/,
  );
});
