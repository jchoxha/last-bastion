import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { unpackGlb } from '../scripts/creature-pipeline/animation-gltf.mjs';

const root = 'public/motion-kits/';

test('motion library covers every current creature body family with verified assets or a runtime contract', async () => {
  const manifest = JSON.parse(await readFile(`${root}index.json`, 'utf8'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.kits.length, 20);
  assert.equal(new Set(manifest.kits.map((kit) => kit.id)).size, 20);

  for (const kit of manifest.kits) {
    assert.match(kit.id, /^[a-z0-9-]+$/);
    assert.ok(
      ['authored', 'hybrid', 'composite', 'procedural'].includes(kit.mode),
    );
    assert.ok(Array.isArray(kit.procedural));
    if (!kit.model) {
      assert.ok(kit.procedural.length > 0, `${kit.id} needs runtime states`);
      continue;
    }
    assert.match(kit.model, /^[a-z0-9-]+\.glb$/);
    assert.match(kit.sha256, /^[a-f0-9]{64}$/);
    const bytes = await readFile(`${root}${kit.model}`);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      kit.sha256,
      `${kit.id} checksum`,
    );
    const glb = unpackGlb(bytes).doc;
    assert.deepEqual(
      glb.animations?.map((clip) => clip.name) || [],
      kit.clips || [],
      `${kit.id} clip inventory`,
    );
    assert.equal(
      kit.bones,
      glb.skins?.[0]?.joints.length || 0,
      `${kit.id} bone count`,
    );
  }
});
