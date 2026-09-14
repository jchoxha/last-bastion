import { setTimeout as delay } from 'node:timers/promises';

export const TRIPO_MODELS = {
  image: 'seedream_v5',
  mesh: 'v3.1-20260211',
  rig: 'v2.5-20260210',
};
export class PipelineError extends Error {}
class ProviderRejectedError extends PipelineError {}
async function responseBytes(response, max) {
  if (!response.body)
    throw new PipelineError(
      `Provider download failed (HTTP ${response.status}).`,
    );
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > max)
        throw new PipelineError('Provider file exceeds the size budget.');
      chunks.push(chunk);
    }
  } finally {
    if (!response.body.locked) await response.body.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
export async function boundedBytes(response, max) {
  if (!response.ok)
    throw new PipelineError(
      `Provider download failed (HTTP ${response.status}).`,
    );
  return responseBytes(response, max);
}
export function createTripo({ key, fetchImpl = fetch, pollMs = 5000 } = {}) {
  const base = 'https://openapi.tripo3d.ai/v3';
  async function call(route, body) {
    if (!key)
      throw new PipelineError(
        'TRIPO_API_KEY is missing. No paid generation has been submitted.',
      );
    const form = body instanceof FormData;
    const response = await fetchImpl(`${base}${route}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Bearer ${key}`,
        ...(!form && body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: form ? body : JSON.stringify(body) } : {}),
    });
    const raw = (await responseBytes(response, 1024 * 1024)).toString();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      if (!response.ok)
        throw new ProviderRejectedError(
          `Tripo rejected the request (HTTP ${response.status}). Check the provider console.`,
        );
      throw new PipelineError('Tripo returned an invalid response.');
    }
    const detail =
      typeof data.message === 'string'
        ? data.message.replace(/[^\w .,:;()/-]/g, '').slice(0, 160)
        : '';
    if (!response.ok)
      throw new ProviderRejectedError(
        `Tripo rejected the request (HTTP ${response.status}${data.code !== undefined ? `, code ${String(data.code).replace(/[^\w.-]/g, '')}` : ''})${detail ? `: ${detail}` : '.'}`,
      );
    if (data.code !== 0)
      throw new ProviderRejectedError(
        `Tripo rejected the request (code ${Number(data.code) || 'unknown'})${detail ? `: ${detail}` : '. Check the provider console.'}`,
      );
    return data.data;
  }
  return {
    configured: Boolean(key),
    async upload(bytes, name) {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: 'image/png' }), name);
      const data = await call('/files', form);
      if (typeof data.file_token !== 'string')
        throw new PipelineError('Tripo upload returned no file token.');
      return data.file_token;
    },
    async task(job, stage, route, body, persist, previousError = '') {
      let state = job.tasks[stage];
      if (
        state?.submitting &&
        !state.taskId &&
        /^Provider download failed \(HTTP 4\d\d\)\.$/.test(
          previousError || job.error || '',
        )
      ) {
        delete job.tasks[stage];
        delete job.error;
        state = undefined;
        await persist();
      }
      if (state?.output) return state;
      if (!state) {
        // Persist intent BEFORE POST. A lost response must never automatically incur another charge.
        state = job.tasks[stage] = { submitting: true };
        await persist();
        let data;
        try {
          data = await call(route, body);
        } catch (error) {
          if (error instanceof ProviderRejectedError) {
            delete job.tasks[stage];
            await persist();
          }
          throw error;
        }
        if (typeof data.task_id !== 'string' || !/^[\w-]+$/.test(data.task_id))
          throw new PipelineError(
            'Provider returned no valid task ID. Check the console before creating another job.',
          );
        state.taskId = data.task_id;
        state.submitting = false;
        await persist();
      }
      if (!state.taskId)
        throw new PipelineError(
          'Submission outcome is uncertain. Check the Tripo console; this job will not submit that stage twice.',
        );
      const deadline = Date.now() + 30 * 60 * 1000;
      while (Date.now() < deadline) {
        const data = await call(`/tasks/${state.taskId}`);
        if (data.status === 'success') {
          state.output = data.output;
          state.credits = data.credits_consumed || 0;
          await persist();
          return state;
        }
        if (['failed', 'cancelled'].includes(data.status))
          throw new PipelineError(
            `Tripo ${stage} task ${data.status}. Existing task ID retained.`,
          );
        job.progress = Number(data.progress) || 0;
        await persist();
        await delay(pollMs);
      }
      throw new PipelineError(
        'Provider polling timed out. Resume will poll the saved task instead of submitting again.',
      );
    },
    async download(url, max) {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        parsed.port ||
        !(
          parsed.hostname === 'tripo3d.ai' ||
          parsed.hostname.endsWith('.tripo3d.ai') ||
          // Observed in the authenticated v3 task response for our first live mesh.
          parsed.hostname === 'tripo-data.rg1.data.tripo3d.com'
        )
      )
        throw new PipelineError(
          `Provider returned an unexpected asset host (${parsed.hostname}).`,
        );
      return boundedBytes(
        await fetchImpl(parsed, {
          signal: AbortSignal.timeout(120000),
          redirect: 'error',
        }),
        max,
      );
    },
  };
}
