import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  copyFile,
} from 'node:fs/promises';
import path from 'node:path';
import { FORMS } from '../../lib/creatures/core.ts';
import { PipelineError, TRIPO_MODELS } from './tripo.mjs';
import { validateRiggedGlb } from './validate.mjs';
import { modelPrompt } from './model-prompt.mjs';
import { modelingReferencePrompt } from './art-prompt.mjs';
import { buildAnimationSet } from './animation-set.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
async function json(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + '\n');
  await rename(`${file}.tmp`, file);
}
export function normalizeRequest(value) {
  if (
    !value ||
    value.version !== 1 ||
    !['canine-v1', 'humanoid-v1'].includes(value.bodyPlan) ||
    !FORMS.includes(value.form)
  )
    throw new PipelineError('Choose a supported body plan and form.');
  const rosterId = typeof value.rosterId === 'string' ? value.rosterId : '';
  const concept = typeof value.concept === 'string' ? value.concept.trim() : '';
  if (
    Boolean(rosterId) === Boolean(concept) ||
    (rosterId && !/^[a-z0-9_-]{1,60}$/.test(rosterId)) ||
    concept.length > 400
  )
    throw new PipelineError(
      'Supply either one Chimera roster ID or a concept (up to 400 characters).',
    );
  if (
    typeof value.seed !== 'string' ||
    !value.seed.trim() ||
    value.seed.length > 80
  )
    throw new PipelineError('A seed of 1–80 characters is required.');
  if (
    value.mode !== undefined &&
    !['text', 'image-direct', 'image'].includes(value.mode)
  )
    throw new PipelineError(
      'Choose text, direct-image or normalized-image modeling.',
    );
  if (
    value.modelDescription !== undefined &&
    (typeof value.modelDescription !== 'string' ||
      value.modelDescription.length > 600)
  )
    throw new PipelineError(
      'Model description must be at most 600 characters.',
    );
  return {
    version: 1,
    rosterId,
    concept,
    bodyPlan: value.bodyPlan,
    form: value.form,
    seed: value.seed.trim(),
    mode: value.mode || 'image',
    ...(value.modelDescription
      ? { modelDescription: value.modelDescription.trim() }
      : {}),
  };
}
export async function createPipeline({
  root,
  chimera,
  provider,
  validate = validateRiggedGlb,
}) {
  const jobRoot = path.join(root, 'work/creature-pipeline/jobs');
  const assetRoot = path.join(root, 'public/creatures');
  await mkdir(jobRoot, { recursive: true });
  await mkdir(assetRoot, { recursive: true });
  const jobs = new Map();
  let running = false;
  for (const id of await readdir(jobRoot)) {
    if (!/^job_[a-f0-9]{24}$/.test(id)) continue;
    const job = await json(path.join(jobRoot, id, 'job.json'));
    if (job) {
      if (job.status === 'running' || job.status === 'queued') {
        job.status = 'paused';
        job.error =
          'Service restarted. Resume to continue from saved provider task IDs.';
      }
      jobs.set(id, job);
    }
  }
  const persist = (job) =>
    atomicJson(path.join(jobRoot, job.id, 'job.json'), job);
  const view = (job) => ({
    id: job.id,
    request: job.request,
    status: job.status,
    stage: job.stage,
    progress: job.progress || 0,
    error: job.error,
    creature: job.creature,
    asset: job.asset,
    report: job.report,
  });
  async function run(job) {
    const dir = path.join(jobRoot, job.id);
    const previousError = job.error || '';
    const save = () => persist(job);
    const task = async (stage, route, body) => {
      job.stage = stage;
      job.progress = 0;
      await save();
      return provider.task(job, stage, route, body, save, previousError);
    };
    try {
      job.status = 'running';
      delete job.error;
      await save();
      if (!job.creature) {
        job.stage = 'chimera';
        await save();
        const source = await chimera.resolve(job.request);
        if (source.art) await writeFile(path.join(dir, 'art.png'), source.art);
        job.hasArt = Boolean(source.art);
        job.creature = source.creature;
        job.artPrompt = source.artPrompt;
        await atomicJson(path.join(dir, 'chimera.json'), source.definition);
        await save();
      }
      if (!provider.configured) {
        job.status = 'blocked';
        job.stage = 'provider';
        job.error =
          'TRIPO_API_KEY is missing. Chimera definition/art are saved; no paid task has been submitted.';
        await save();
        return;
      }
      const seed =
        parseInt(hash(job.request.seed).slice(0, 8), 16) & 0x7fffffff;
      let mesh;
      if (job.request.mode === 'text') {
        job.modelPrompt ||= modelPrompt(
          job.creature,
          job.request.modelDescription,
        );
        await save();
        mesh = await task('mesh', '/generation/text-to-model', {
          ...job.modelPrompt,
          model: TRIPO_MODELS.mesh,
          texture: true,
          pbr: true,
          face_limit: 20000,
          texture_quality: 'standard',
          model_seed: seed,
          image_seed: seed,
          texture_seed: seed,
        });
        if (!job.hasArt) {
          await writeFile(
            path.join(dir, 'art.png'),
            await provider.download(
              mesh.output.rendered_image_url,
              20 * 1024 * 1024,
            ),
          );
        }
      } else {
        let artSource;
        if (job.hasArt) {
          if (!job.artToken) {
            job.stage = 'upload';
            await save();
            job.artToken = await provider.upload(
              await readFile(path.join(dir, 'art.png')),
              'chimera.png',
            );
            await save();
          }
          artSource = job.artToken;
        } else {
          const art = await task('art', '/generation/text-to-image', {
            model: TRIPO_MODELS.image,
            prompt: job.artPrompt,
            size: '2K',
            output_format: 'png',
          });
          artSource = art.taskId;
          await writeFile(
            path.join(dir, 'art.png'),
            await provider.download(
              art.output.generated_image_url,
              20 * 1024 * 1024,
            ),
          );
        }
        if (job.request.mode !== 'image-direct') {
          const reference = await task(
            'reference',
            '/generation/image-to-image',
            {
              input: artSource,
              model: TRIPO_MODELS.image,
              size: '2K',
              output_format: 'png',
              prompt: modelingReferencePrompt(job.request.bodyPlan),
            },
          );
          await writeFile(
            path.join(dir, 'reference.png'),
            await provider.download(
              reference.output.generated_image_url,
              20 * 1024 * 1024,
            ),
          );
          artSource = reference.taskId;
        }
        mesh = await task('mesh', '/generation/image-to-model', {
          input: artSource,
          model: TRIPO_MODELS.mesh,
          texture: true,
          pbr: true,
          face_limit: 20000,
          texture_quality: 'standard',
          model_seed: seed,
          texture_seed: seed,
        });
      }
      await writeFile(
        path.join(dir, 'mesh.glb'),
        await provider.download(mesh.output.model_url, 32 * 1024 * 1024),
      );
      const rigType =
        job.request.bodyPlan === 'canine-v1' ? 'quadruped' : 'biped';
      const check = await task('rig-check', '/animations/rig-check', {
        input: mesh.taskId,
      });
      if (check.output.riggable !== true || check.output.rig_type !== rigType)
        throw new PipelineError(
          `Rig check did not confirm ${rigType}. Mesh retained; the creature was not installed.`,
        );
      const rig = await task('rig', '/animations/rig', {
        input: mesh.taskId,
        model: TRIPO_MODELS.rig,
        rig_type: rigType,
        spec: 'tripo',
        out_format: 'glb',
      });
      await writeFile(
        path.join(dir, 'rig.glb'),
        await provider.download(rig.output.model_url, 32 * 1024 * 1024),
      );
      const animation = await task('animation', '/animations/retarget', {
        input: rig.taskId,
        animation:
          rigType === 'quadruped' ? 'preset:quadruped:walk' : 'preset:walk',
        out_format: 'glb',
        bake_animation: true,
        export_with_geometry: true,
        animate_in_place: true,
      });
      let bytes = await provider.download(
        animation.output.model_url,
        32 * 1024 * 1024,
      );
      await writeFile(path.join(dir, 'animated.glb'), bytes);
      job.stage = 'validation';
      await save();
      job.report = await validate(bytes, job.request.bodyPlan);
      const trial = await buildAnimationSet(bytes, job.request.bodyPlan);
      job.animationTrial = trial.report;
      if (trial.report.status === 'animation-set') {
        bytes = trial.bytes;
        const defaultWalk = trial.report.walkClip;
        job.report = await validate(bytes, job.request.bodyPlan);
        job.report.walkClip = defaultWalk;
        await writeFile(path.join(dir, 'animation-trial.glb'), bytes);
      }
      await atomicJson(path.join(dir, 'animation-trial.json'), trial.report);
      await save();
      const assetId = `asset_${hash(bytes).slice(0, 24)}`;
      job.stage = 'installation';
      await save();
      // Immutable asset first, manifest last: interrupted jobs never expose partial files.
      const temp = path.join(assetRoot, `${assetId}.glb.tmp`);
      await writeFile(temp, bytes);
      await rename(temp, path.join(assetRoot, `${assetId}.glb`));
      const targetPortrait =
        job.request.mode === 'image' ? 'reference.png' : 'art.png';
      await copyFile(
        path.join(dir, targetPortrait),
        path.join(assetRoot, `${assetId}.png`),
      );
      await copyFile(
        path.join(dir, 'art.png'),
        path.join(assetRoot, `${assetId}-card.png`),
      );
      const manifest = await json(path.join(assetRoot, 'index.json'), {
        version: 1,
        assets: [],
      });
      const asset = {
        id: assetId,
        creature: job.creature,
        model: `${assetId}.glb`,
        portrait: `${assetId}.png`,
        cardPortrait: `${assetId}-card.png`,
        sha256: hash(bytes),
        walkClip: job.report.walkClip,
        yaw: -Math.PI / 2,
        report: job.report,
        source: {
          repository: 'jchoxha/chimera_cards',
          revision: chimera.revision,
          rosterId: job.request.rosterId,
          jobId: job.id,
          models: TRIPO_MODELS,
          animationTrial: job.animationTrial,
        },
      };
      manifest.assets = [
        ...manifest.assets.filter((a) => a.creature.id !== job.creature.id),
        asset,
      ];
      if (manifest.assets.length > 48)
        throw new PipelineError(
          'Generated library reached its 48-creature budget.',
        );
      await atomicJson(path.join(assetRoot, 'index.json'), manifest);
      job.asset = asset;
      job.status = 'ready';
      job.stage = 'installed';
      await save();
    } catch (error) {
      job.status = 'failed';
      job.error =
        error instanceof PipelineError
          ? error.message
          : `Stage ${job.stage} failed. Check local configuration and retained files; no replacement asset was installed.`;
      await save();
    }
  }
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (true) {
        const next = [...jobs.values()].find((job) => job.status === 'queued');
        if (!next) break;
        await run(next);
      }
    } finally {
      running = false;
    }
  }
  return {
    list: () => [...jobs.values()].map(view),
    get: (id) => (jobs.has(id) ? view(jobs.get(id)) : null),
    async submit(value) {
      const request = normalizeRequest(value);
      const id = `job_${hash(JSON.stringify({ request, revision: chimera.revision, models: TRIPO_MODELS, pipeline: 1 })).slice(0, 24)}`;
      if (jobs.has(id)) return view(jobs.get(id));
      if (jobs.size >= 128)
        throw new PipelineError(
          'Job history reached its 128-job limit. Archive local job files before adding more.',
        );
      const job = {
        id,
        request,
        status: 'queued',
        stage: 'chimera',
        tasks: {},
      };
      jobs.set(id, job);
      await persist(job);
      void drain();
      return view(job);
    },
    async resume(id) {
      const job = jobs.get(id);
      if (!job) throw new PipelineError('Unknown job.');
      if (['failed', 'blocked', 'paused'].includes(job.status)) {
        job.status = 'queued';
        await persist(job);
        void drain();
      }
      return view(job);
    },
  };
}
