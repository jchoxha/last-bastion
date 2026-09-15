import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadChimera } from './chimera.mjs';
import { loadPackagedInputs } from './packaged-inputs.mjs';
import { createTripo, PipelineError } from './tripo.mjs';
import { createPipeline } from './jobs.mjs';

export function createPipelineServer({
  root,
  pipeline,
  chimera,
  packaged = { catalog: [] },
  provider,
  origins = [],
}) {
  return http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    const origin = req.headers.origin;
    if (
      !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '') ||
      (origin &&
        !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin) &&
        !origins.includes(origin))
    ) {
      send(403, { error: 'Origin not allowed.' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET') {
        if (url.pathname === '/health') {
          send(200, {
            version: 1,
            meshProvider: 'tripo',
            configured: provider.configured,
            conceptConfigured: Boolean(process.env.CREATURE_AI_MODEL),
            sourceRevision: chimera.revision,
            message: provider.configured
              ? 'Tripo API configured. Generation consumes provider credits.'
              : 'TRIPO_API_KEY is missing. Mesh/rig generation is blocked; preparing Chimera inputs is available.',
          });
          return;
        }
        if (url.pathname === '/catalog') {
          send(200, [...packaged.catalog, ...chimera.catalog]);
          return;
        }
        if (url.pathname === '/jobs') {
          send(200, pipeline.list());
          return;
        }
        const match = url.pathname.match(/^\/jobs\/(job_[a-f0-9]{24})$/);
        if (match) {
          const job = pipeline.get(match[1]);
          send(job ? 200 : 404, job || { error: 'Job not found.' });
          return;
        }
        const asset = url.pathname.match(
          /^\/assets\/(index\.json|asset_[a-f0-9]{24}\.(?:glb|png))$/,
        );
        if (asset) {
          const data = await readFile(
            path.join(root, 'public/creatures', asset[1]),
          );
          res.writeHead(200, {
            'Content-Type': asset[1].endsWith('.glb')
              ? 'model/gltf-binary'
              : asset[1].endsWith('.png')
                ? 'image/png'
                : 'application/json',
            'Cache-Control':
              asset[1] === 'index.json'
                ? 'no-store'
                : 'public, max-age=31536000, immutable',
          });
          res.end(data);
          return;
        }
      }
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) {
          send(415, { error: 'Expected application/json.' });
          return;
        }
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4096) throw new PipelineError('Request too large.');
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        if (url.pathname === '/jobs') {
          send(202, await pipeline.submit(body));
          return;
        }
        const match = url.pathname.match(
          /^\/jobs\/(job_[a-f0-9]{24})\/resume$/,
        );
        if (match) {
          send(202, await pipeline.resume(match[1]));
          return;
        }
      }
      send(404, { error: 'Not found.' });
    } catch (error) {
      send(error.code === 'ENOENT' ? 404 : 422, {
        error:
          error instanceof PipelineError
            ? error.message
            : 'Request failed. Check the local pipeline configuration.',
      });
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const chimera = await loadChimera(root, process.env.CHIMERA_SOURCE_DIR);
  const packaged = await loadPackagedInputs(root);
  const provider = createTripo({ key: process.env.TRIPO_API_KEY });
  const pipeline = await createPipeline({ root, chimera, packaged, provider });
  const server = createPipelineServer({
    root,
    pipeline,
    chimera,
    packaged,
    provider,
    origins: (process.env.CREATURE_ALLOWED_ORIGINS || '')
      .split(',')
      .filter(Boolean),
  });
  server.requestTimeout = 15000;
  server.listen(8790, '127.0.0.1', () =>
    console.log(
      `Creature pipeline: http://127.0.0.1:8790 — ${provider.configured ? 'Tripo configured' : 'TRIPO_API_KEY missing; generation blocked'}`,
    ),
  );
}
