import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createCreatureActor } from '../lib/creatures/actor.ts';
import { DEFAULT_INPUT, generateLocal } from '../lib/creatures/core.ts';
import { createTripo } from '../scripts/creature-pipeline/tripo.mjs';
import { createPipeline } from '../scripts/creature-pipeline/jobs.mjs';
import { validateRiggedGlb } from '../scripts/creature-pipeline/validate.mjs';
import { createPipelineServer } from '../scripts/creature-pipeline/server.mjs';

// Test-only textured proxy. Never included in public/ or represented as AI output.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64',
);
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((data) => {
      this.result = data;
      this.onloadend?.();
    });
  }
};
const creature = generateLocal(DEFAULT_INPUT);
const actor = createCreatureActor(creature);
const raw = Buffer.from(
  await new GLTFExporter().parseAsync(actor.group, {
    binary: true,
    animations: actor.clips.filter((clip) => clip.name === 'walk'),
  }),
);
actor.dispose();
const jsonLength = raw.readUInt32LE(12);
const document = JSON.parse(raw.subarray(20, 20 + jsonLength));
const binary = raw.subarray(28 + jsonLength);
function buildGlb(doc, bin) {
  const text = Buffer.from(JSON.stringify(doc));
  const json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(json);
  const data = Buffer.alloc(Math.ceil(bin.length / 4) * 4);
  bin.copy(data);
  const out = Buffer.alloc(28 + json.length + data.length);
  [0x46546c67, 2, out.length, json.length, 0x4e4f534a].forEach((n, i) =>
    out.writeUInt32LE(n, i * 4),
  );
  json.copy(out, 20);
  out.writeUInt32LE(data.length, 20 + json.length);
  out.writeUInt32LE(0x004e4942, 24 + json.length);
  data.copy(out, 28 + json.length);
  return out;
}
document.bufferViews.push({
  buffer: 0,
  byteOffset: binary.length,
  byteLength: png.length,
});
document.images = [
  { bufferView: document.bufferViews.length - 1, mimeType: 'image/png' },
];
document.textures = [{ source: 0 }];
document.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
document.buffers[0].byteLength = binary.length + png.length;
const bytes = buildGlb(document, Buffer.concat([binary, png]));
const input = {
  version: 1,
  rosterId: 'voltfang',
  concept: '',
  bodyPlan: 'canine-v1',
  form: 'regular',
  seed: 'pipeline-test',
};
const chimera = {
  revision: 'fixture',
  catalog: [],
  async resolve() {
    return {
      creature,
      definition: { name: creature.spec.name },
      art: png,
      artPrompt: 'Chimera canonical prompt',
    };
  },
};
async function temporary() {
  await mkdir('work/pipeline-tests', { recursive: true });
  return mkdtemp(path.resolve('work/pipeline-tests/run-'));
}
async function finished(pipeline, id) {
  for (let i = 0; i < 500; i++) {
    const job = pipeline.get(id);
    if (!['queued', 'running'].includes(job.status)) {
      await delay(15);
      return job;
    }
    await delay(20);
  }
  throw Error('Pipeline did not settle.');
}
function fakeTripo({ rigType = 'quadruped', assetBytes = bytes } = {}) {
  const calls = [],
    tasks = new Map();
  const provider = createTripo({
    key: 'test-key-never-real',
    pollMs: 0,
    async fetchImpl(url, init = {}) {
      const target = new URL(url);
      if (target.hostname === 'cdn.tripo3d.ai')
        return new Response(
          target.pathname.endsWith('.png') ? png : assetBytes,
        );
      const route = target.pathname.replace('/v3', '');
      if (route === '/files')
        return Response.json({ code: 0, data: { file_token: 'file_fixture' } });
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        calls.push({ route, body });
        const id = `task_${calls.length}`;
        const output = route.endsWith('rig-check')
          ? { riggable: true, rig_type: rigType }
          : route.endsWith('image')
            ? { generated_image_url: 'https://cdn.tripo3d.ai/test.png' }
            : { model_url: 'https://cdn.tripo3d.ai/test.glb' };
        tasks.set(id, output);
        return Response.json({ code: 0, data: { task_id: id } });
      }
      const id = route.split('/').pop();
      assert.ok(tasks.has(id));
      return Response.json({
        code: 0,
        data: { status: 'success', output: tasks.get(id), credits_consumed: 0 },
      });
    },
  });
  return { provider, calls };
}

test('GLB gate rejects static, untextured and malformed files; accepts the test skin', async () => {
  const report = await validateRiggedGlb(bytes, 'canine-v1');
  assert.ok(report.bones >= 12);
  assert.ok(report.triangles > 0);
  await assert.rejects(validateRiggedGlb(raw, 'canine-v1'), /textured/);
  await assert.rejects(
    validateRiggedGlb(Buffer.from('not a model'), 'canine-v1'),
    /header/,
  );
  const external = structuredClone(document);
  external.images[0] = { uri: 'http://127.0.0.1/private.png' };
  await assert.rejects(
    validateRiggedGlb(
      buildGlb(external, Buffer.concat([binary, png])),
      'canine-v1',
    ),
    /URI/,
  );
  const staticDoc = structuredClone(document);
  delete staticDoc.animations;
  await assert.rejects(
    validateRiggedGlb(
      buildGlb(staticDoc, Buffer.concat([binary, png])),
      'canine-v1',
    ),
    /animations/,
  );
  const still = Buffer.concat([binary, png]);
  const stillDoc = structuredClone(document);
  for (const sampler of stillDoc.animations[0].samplers) {
    const a = stillDoc.accessors[sampler.output],
      v = stillDoc.bufferViews[a.bufferView];
    delete a.min;
    delete a.max;
    const components = a.type === 'VEC4' ? 4 : 3,
      stride = v.byteStride || components * 4;
    const offset = (v.byteOffset || 0) + (a.byteOffset || 0);
    for (let frame = 1; frame < a.count; frame++)
      for (let axis = 0; axis < components; axis++)
        still.writeFloatLE(
          still.readFloatLE(offset + axis * 4),
          offset + frame * stride + axis * 4,
        );
  }
  await assert.rejects(
    validateRiggedGlb(buildGlb(stillDoc, still), 'canine-v1'),
    /animate/,
  );
  const oversized = Buffer.concat([binary, png]);
  oversized.writeUInt32BE(4096, binary.length + 16);
  await assert.rejects(
    validateRiggedGlb(buildGlb(document, oversized), 'canine-v1'),
    /texture|validation/,
  );
});
test('actual Tripo adapter drives all stages and atomically installs a verified asset', async () => {
  const root = await temporary(),
    { provider, calls } = fakeTripo();
  const pipeline = await createPipeline({ root, chimera, provider });
  const started = await pipeline.submit(input),
    done = await finished(pipeline, started.id);
  assert.equal(done.status, 'ready', done.error);
  const manifest = JSON.parse(
    await readFile(path.join(root, 'public/creatures/index.json')),
  );
  assert.equal(manifest.assets.length, 1);
  const asset = manifest.assets[0];
  assert.equal(asset.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(
    await readFile(path.join(root, 'public/creatures', asset.model)),
    bytes,
  );
  assert.equal(
    calls.find((c) => c.route.endsWith('/rig')).body.rig_type,
    'quadruped',
  );
  assert.equal(
    calls.find((c) => c.route.endsWith('/retarget')).body.animate_in_place,
    true,
  );
  const count = calls.length;
  assert.equal((await pipeline.submit(input)).id, started.id);
  assert.equal(calls.length, count);
  const restarted = await createPipeline({ root, chimera, provider });
  assert.equal((await restarted.resume(started.id)).status, 'ready');
  assert.equal(calls.length, count);
});
test('wrong skeleton and invalid GLB cannot enter the game library', async () => {
  for (const options of [{ rigType: 'biped' }, { assetBytes: raw }]) {
    const root = await temporary(),
      { provider } = fakeTripo(options);
    const pipeline = await createPipeline({ root, chimera, provider });
    const job = await pipeline.submit(input),
      done = await finished(pipeline, job.id);
    assert.equal(done.status, 'failed');
    await assert.rejects(
      readFile(path.join(root, 'public/creatures/index.json')),
      { code: 'ENOENT' },
    );
  }
});
test('missing credentials preserve Chimera inputs without submitting any task', async () => {
  const root = await temporary();
  let called = false;
  const provider = createTripo({
    fetchImpl() {
      called = true;
      throw Error('Unexpected request');
    },
  });
  const pipeline = await createPipeline({ root, chimera, provider });
  const job = await pipeline.submit(input),
    done = await finished(pipeline, job.id);
  assert.equal(done.status, 'blocked');
  assert.equal(called, false);
  assert.deepEqual(
    await readFile(
      path.join(root, 'work/creature-pipeline/jobs', job.id, 'art.png'),
    ),
    png,
  );
});
test('uncertain POST is never automatically submitted twice', async () => {
  let calls = 0;
  const provider = createTripo({
    key: 'test',
    fetchImpl() {
      calls++;
      throw Error('Connection lost after send');
    },
  });
  const job = { tasks: {} };
  const save = async () => {};
  await assert.rejects(
    provider.task(job, 'mesh', '/generation/image-to-model', {}, save),
  );
  await assert.rejects(
    provider.task(job, 'mesh', '/generation/image-to-model', {}, save),
    /uncertain/,
  );
  assert.equal(calls, 1);
});
test('new concepts render Chimera art before reference and mesh generation', async () => {
  const root = await temporary(),
    { provider, calls } = fakeTripo();
  const source = {
    ...chimera,
    async resolve(request) {
      const result = await chimera.resolve(request);
      return { ...result, art: undefined };
    },
  };
  const pipeline = await createPipeline({ root, chimera: source, provider });
  const job = await pipeline.submit({
    ...input,
    rosterId: '',
    concept: 'A storm wolf',
  });
  const done = await finished(pipeline, job.id);
  assert.equal(done.status, 'ready', done.error);
  assert.equal(calls[0].route, '/generation/text-to-image');
  assert.equal(calls[0].body.prompt, 'Chimera canonical prompt');
  assert.equal(calls[1].body.input, 'task_1');
});
test('restart after a download failure resumes the saved generation task', async () => {
  const root = await temporary(),
    { provider, calls } = fakeTripo();
  const download = provider.download.bind(provider);
  let failOnce = true;
  provider.download = async (...args) => {
    if (failOnce) {
      failOnce = false;
      throw Error('Transient download failure');
    }
    return download(...args);
  };
  const pipeline = await createPipeline({ root, chimera, provider });
  const job = await pipeline.submit(input);
  assert.equal((await finished(pipeline, job.id)).status, 'failed');
  assert.equal(calls.length, 1);
  const restarted = await createPipeline({ root, chimera, provider });
  await restarted.resume(job.id);
  const done = await finished(restarted, job.id);
  assert.equal(done.status, 'ready', done.error);
  assert.equal(
    calls.filter((c) => c.route === '/generation/image-to-image').length,
    1,
  );
});
test('loopback HTTP rejects hostile origins and oversized job input', async () => {
  const root = await temporary(),
    provider = createTripo();
  const pipeline = await createPipeline({ root, chimera, provider });
  const server = createPipelineServer({ root, chimera, provider, pipeline });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(
      (
        await fetch(`${url}/health`, {
          headers: { Origin: 'https://untrusted.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${url}/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, seed: 'x'.repeat(5000) }),
        })
      ).status,
      422,
    );
    const health = await (await fetch(`${url}/health`)).json();
    assert.equal(health.configured, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
