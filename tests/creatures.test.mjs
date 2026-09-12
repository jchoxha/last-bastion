import assert from 'node:assert/strict';
import {
  DEFAULT_INPUT,
  BODY_TYPES,
  FAMILIES,
  MANIFESTATIONS,
  compatiblePlans,
  generateLocal,
  makeCreature,
  parseCreature,
  parseCollection,
  validateInput,
  generateWithService,
} from '../lib/creatures/core.ts';
import { createCreatureActor, rigJoints } from '../lib/creatures/actor.ts';
import { createCreatureService } from '../scripts/creature-provider.mjs';

const original = generateLocal(DEFAULT_INPUT);
assert.deepEqual(original, generateLocal(DEFAULT_INPUT));
assert.notEqual(
  original.id,
  generateLocal({ ...DEFAULT_INPUT, seed: 'another' }).id,
);
assert.deepEqual(
  parseCreature(
    JSON.stringify({
      ...original,
      id: 'spoof',
      stats: { hp: 999999 },
      assets: { model: 'approved' },
    }),
  ),
  original,
);
assert.throws(() => parseCreature(JSON.stringify({ ...original, version: 2 })));
assert.throws(() =>
  makeCreature({ ...original.spec, color: 'url(https://example.com)' }),
);
assert.throws(() =>
  validateInput({ ...DEFAULT_INPUT, bodies: ['Beast', 'Beast'] }),
);
assert.throws(() => validateInput({ ...DEFAULT_INPUT, bodyPlan: '__proto__' }));
assert.throws(() =>
  validateInput({ ...DEFAULT_INPUT, family: 'Avian', bodyPlan: 'canine-v1' }),
);
assert.throws(() => parseCollection('['));
assert.throws(() => parseCollection(JSON.stringify(Array(49).fill(original))));
assert.equal(parseCollection(JSON.stringify([original, original])).length, 1);
for (const body of BODY_TYPES) {
  for (const family of body === 'Beast' ? FAMILIES : ['']) {
    for (const manifestation of body === 'Aberration' ? MANIFESTATIONS : ['']) {
      const c = generateLocal({
        ...DEFAULT_INPUT,
        bodies: [body],
        family,
        manifestation,
        archetype: body === 'Humanoid' ? 'Warrior' : '',
        bodyPlan: compatiblePlans([body], family)[0],
      });
      assert.deepEqual(parseCreature(JSON.stringify(c)), c);
    }
  }
}
for (const plan of ['canine-v1', 'humanoid-v1']) {
  const actor = createCreatureActor(
    makeCreature({ ...original.spec, bodyPlan: plan }),
  );
  const joints = rigJoints(plan);
  assert.equal(actor.skeleton.bones.length, joints.length);
  assert.equal(new Set(joints.map((j) => j.name)).size, joints.length);
  assert(actor.mesh.isSkinnedMesh);
  assert(actor.mesh.geometry.attributes.skinWeight.count > 0);
  actor.setAnimation('walk');
  actor.update(0.1);
  actor.group.updateMatrixWorld(true);
  for (const bone of actor.skeleton.bones)
    assert(bone.matrixWorld.elements.every(Number.isFinite));
  actor.setAnimation('rest');
  actor.group.updateMatrixWorld(true);
  joints.forEach((joint, index) => {
    const pos = actor.skeleton.bones[index].getWorldPosition(
      actor.group.position.clone(),
    );
    joint.position.forEach((n, i) =>
      assert(Math.abs(pos.toArray()[i] - n) < 1e-6),
    );
  });
  actor.dispose();
}
let calls = 0,
  invalid = false;
const service = createCreatureService({
  endpoint: 'http://127.0.0.1:9999/v1/chat/completions',
  model: 'test-only',
  cooldown: 0,
  key: 'test-secret',
  fetchImpl: async (_url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...original.spec,
                name: 'Provider Wolf',
                ...(invalid ? { bodyPlan: 'avian-draft' } : {}),
              }),
            },
          },
        ],
      }),
    );
  },
});
await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${service.address().port}/creatures`;
try {
  const c = await generateWithService(DEFAULT_INPUT, endpoint);
  assert.equal(c.spec.name, 'Provider Wolf');
  assert.deepEqual(c.stats, original.stats);
  const forbidden = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(forbidden.status, 403);
  assert.equal(calls, 1);
  invalid = true;
  await assert.rejects(generateWithService(DEFAULT_INPUT, endpoint));
  const bad = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 1,
      input: { ...DEFAULT_INPUT, role: 'arbitrary-code' },
    }),
  });
  assert.equal(bad.status, 422);
  assert.equal(calls, 2);
} finally {
  await new Promise((resolve) => service.close(resolve));
}
console.log(
  'Creature schemas, deterministic generation, rig rest poses, imports, and mocked AI service passed.',
);
