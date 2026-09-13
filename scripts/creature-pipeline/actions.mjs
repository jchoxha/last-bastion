import { readFile, readdir, mkdir, cp, appendFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadChimera } from './chimera.mjs';
import { createPipeline, normalizeRequest } from './jobs.mjs';
import { createTripo } from './tripo.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  if (process.env.GITHUB_RUN_ATTEMPT !== '1')
    throw Error(
      'Do not rerun a paid workflow. Start a new run with Resume run ID to restore its saved tasks.',
    );
  if (!process.env.TRIPO_API_KEY)
    throw Error(
      'Add the TRIPO_API_KEY repository Actions secret before generating. No Tripo call was made.',
    );
  const resume = process.env.RESUME_RUN_ID || '';
  if (resume && !/^\d+$/.test(resume)) throw Error('Invalid resume run ID.');
  if (resume) {
    const recovered = path.join(root, 'work/recovered');
    const ids = (await readdir(recovered)).filter((id) =>
      /^job_[a-f0-9]{24}$/.test(id),
    );
    if (ids.length !== 1)
      throw Error(
        'Recovery must contain exactly one saved job. No new job was started.',
      );
    await mkdir(path.join(root, 'work/creature-pipeline/jobs'), {
      recursive: true,
    });
    await cp(
      path.join(recovered, ids[0]),
      path.join(root, 'work/creature-pipeline/jobs', ids[0]),
      { recursive: true },
    );
    // A recovered installed job already published or has its own artifact; never resubmit it.
    const saved = JSON.parse(
      await readFile(path.join(recovered, ids[0], 'job.json')),
    );
    if (saved.status === 'ready')
      throw Error(
        'This job already completed generation. Recover/publish its installed-assets artifact instead.',
      );
  }
  const chimera = await loadChimera(root);
  const pipeline = await createPipeline({
    root,
    chimera,
    provider: createTripo({ key: process.env.TRIPO_API_KEY }),
  });
  const job = resume
    ? await pipeline.resume(pipeline.list()[0].id)
    : await pipeline.submit(
        normalizeRequest(JSON.parse(process.env.CREATURE_REQUEST || '{}')),
      );
  let lastStage;
  while (true) {
    const current = pipeline.get(job.id);
    if (current.stage !== lastStage) {
      console.log(`Creature job ${current.id}: ${current.stage}`);
      lastStage = current.stage;
    }
    if (!['queued', 'running'].includes(current.status)) {
      if (current.status !== 'ready')
        throw Error(current.error || `Generation ${current.status}.`);
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `Creature installed: **${current.creature.spec.name.replace(/[\r\n*]/g, ' ')}**.\n\nTechnical validation passed; inspect the walk and skeleton in the game. Publishing and Pages deployment follow.\n`,
      );
      break;
    }
    await delay(2000);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
