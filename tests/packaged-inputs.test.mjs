import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadPackagedInputs } from '../scripts/creature-pipeline/packaged-inputs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('packaged creature input preserves approved card/spec art and rig contract', async () => {
  const inputs = await loadPackagedInputs(root);
  assert.deepEqual(inputs.catalog, [
    {
      id: 'cinderbound-warden',
      name: 'Cinderbound Warden',
      source: 'packaged',
    },
    {
      id: 'ironhide',
      name: 'Ironhide',
      source: 'packaged',
    },
  ]);
  const source = await inputs.resolve({
    rosterId: 'cinderbound-warden',
    bodyPlan: 'humanoid-v1',
    form: 'regular',
  });
  assert.equal(source.directModelInput, true);
  assert.equal(source.creature.spec.name, 'Cinderbound Warden');
  assert.equal(source.creature.spec.bodyPlan, 'humanoid-v1');
  assert(source.art.length > 1000);
  assert(source.cardArt.length > 1000);
  const ironhide = await inputs.resolve({
    rosterId: 'ironhide',
    bodyPlan: 'humanoid-v1',
    form: 'regular',
  });
  assert.equal(ironhide.creature.spec.name, 'Ironhide');
  assert(ironhide.art.length > 1000);
  assert(ironhide.cardArt.length > 1000);
  await assert.rejects(
    inputs.resolve({
      rosterId: 'cinderbound-warden',
      bodyPlan: 'canine-v1',
      form: 'regular',
    }),
    /requires the humanoid-v1 body plan/,
  );
  assert.equal(
    await inputs.resolve({
      rosterId: 'not-packaged',
      bodyPlan: 'canine-v1',
      form: 'regular',
    }),
    null,
  );
});
