'use client';
import { useEffect, useRef, useState } from 'react';
import { type Creature } from '@/lib/creatures/core';
import CreatureCloud from './creature-cloud';
import {
  assetBase,
  initializeGeneratedAssets,
  preloadGeneratedAsset,
  refreshGeneratedAssets,
  type GeneratedAsset,
} from '@/lib/creatures/generated';

const WORKER = 'http://127.0.0.1:8790';
type Job = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  error?: string;
  creature?: Creature;
  asset?: GeneratedAsset;
};
type Health = {
  configured: boolean;
  conceptConfigured: boolean;
  message: string;
};
async function request<T = unknown>(route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${WORKER}${route}`, {
    signal: AbortSignal.timeout(10000),
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(
      (data as { error?: string }).error || 'Pipeline request failed.',
    );
  return data as T;
}
export default function CreaturePipeline({
  onSelect,
}: {
  onSelect: (creature: Creature) => void;
}) {
  const [health, setHealth] = useState<Health | null>(null),
    [status, setStatus] = useState(
      'Connect the local worker to generate textured, rigged creatures from Chimera.',
    );
  const [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const [rosterId, setRosterId] = useState('voltfang'),
    [concept, setConcept] = useState(''),
    [bodyPlan, setBodyPlan] = useState('canine-v1'),
    [form, setForm] = useState('regular'),
    [seed, setSeed] = useState('voltfang-1');
  const [busy, setBusy] = useState(false),
    [base, setBase] = useState('');
  const seen = useRef(new Set<string>()),
    mounted = useRef(true);
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    mounted.current = true;
    void initializeGeneratedAssets()
      .then(() => refreshGeneratedAssets())
      .then((items) => {
        if (mounted.current) {
          setAssets(items);
          setBase(assetBase());
        }
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!health) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const items = await request<Job[]>('/jobs');
        if (stopped) return;
        setJobs(items);
        const ready = items.filter(
          (j) => j.status === 'ready' && !seen.current.has(j.id),
        );
        if (ready.length) {
          const installed = await refreshGeneratedAssets(`${WORKER}/assets/`);
          if (stopped) return;
          setAssets(installed);
          setBase(`${WORKER}/assets/`);
          for (const job of ready) {
            if (job.creature) {
              await preloadGeneratedAsset(job.creature);
              if (stopped) return;
              selectRef.current(job.creature);
            }
            seen.current.add(job.id);
          }
          setStatus(
            'Generated asset installed and loaded. Inspect its walk and skeleton in the preview; Spawn test enemy uses this mesh.',
          );
        }
      } catch {
        if (!stopped)
          setStatus(
            'Worker unavailable or asset loading failed. Jobs remain saved on the PC; reconnect or resume after fixing the reported stage.',
          );
      }
      if (!stopped) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [health]);
  async function connect() {
    setBusy(true);
    try {
      const h = await request<Health>('/health');
      const c = await request<{ id: string; name: string }[]>('/catalog');
      await initializeGeneratedAssets();
      const installed = await refreshGeneratedAssets(`${WORKER}/assets/`);
      if (!mounted.current) return;
      setHealth(h);
      setCatalog(c);
      setAssets(installed);
      setBase(`${WORKER}/assets/`);
      setStatus(h.message);
      try {
        localStorage.setItem('last-bastion-asset-source', WORKER);
      } catch {
        /* optional preference */
      }
    } catch {
      if (mounted.current)
        setStatus(
          'Start npm run dev:creature-pipeline on this PC, then connect again.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    try {
      const job = await request<Job>('/jobs', {
        version: 1,
        rosterId,
        concept: rosterId ? '' : concept,
        bodyPlan,
        form,
        seed,
      });
      if (mounted.current) {
        setJobs((old) => [...old.filter((j) => j.id !== job.id), job]);
        setStatus(
          'Job saved. You can leave the forge; the local worker continues.',
        );
      }
    } catch (e) {
      if (mounted.current) setStatus((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <CreatureCloud onSelect={onSelect} />
      <section
        className="forge-panel pipeline-panel"
        aria-label="Chimera model pipeline"
      >
        <h2>Chimera → rigged game creature</h2>
        <p>
          Chimera definition and art → neutral reference → textured mesh →
          body-specific rig → animation library → validation → game library.
        </p>
        <button onClick={connect} disabled={busy}>
          {health ? 'Reconnect worker' : 'Connect local worker'}
        </button>
        <output>{status}</output>
        {health && (
          <>
            <div className="forge-fields">
              <label>
                Chimera source
                <select
                  value={rosterId}
                  onChange={(e) => setRosterId(e.target.value)}
                >
                  <option value="">Forge a new concept</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Model body plan
                <select
                  value={bodyPlan}
                  onChange={(e) => setBodyPlan(e.target.value)}
                >
                  <option value="canine-v1">Canine quadruped</option>
                  <option value="humanoid-v1">Humanoid biped</option>
                </select>
              </label>
              <label>
                Model form
                <select value={form} onChange={(e) => setForm(e.target.value)}>
                  {['baby', 'young', 'regular', 'elite', 'boss'].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                Generation seed
                <input
                  value={seed}
                  maxLength={80}
                  onChange={(e) => setSeed(e.target.value)}
                />
              </label>
            </div>
            {!rosterId && (
              <label>
                New Chimera concept
                <textarea
                  value={concept}
                  maxLength={400}
                  onChange={(e) => setConcept(e.target.value)}
                />
              </label>
            )}
            {!rosterId && !health.conceptConfigured && (
              <p>
                Configure CREATURE_AI_MODEL on the worker to use Chimera’s AI
                forge.
              </p>
            )}
            <p>
              {health.configured
                ? 'This action sends the selected art/concept to Tripo and consumes API credits for reference, mesh, rig and animation generation.'
                : 'Mesh generation is blocked until TRIPO_API_KEY is configured. Preparing inputs does not call Tripo.'}
            </p>
            <button
              disabled={
                busy ||
                (!rosterId && (!concept.trim() || !health.conceptConfigured))
              }
              onClick={submit}
            >
              {health.configured
                ? 'Generate and install creature'
                : 'Prepare Chimera inputs'}
            </button>
            <ul>
              {jobs.map((job) => (
                <li key={job.id}>
                  <strong>
                    {job.creature?.spec.name || 'Chimera creature'}
                  </strong>
                  : {job.status} · {job.stage}
                  {job.status === 'running' ? ` ${job.progress}%` : ''}
                  {job.error && <p>{job.error}</p>}
                  {['blocked', 'failed', 'paused'].includes(job.status) && (
                    <button
                      onClick={() => {
                        void request(`/jobs/${job.id}/resume`, {}).catch((e) =>
                          setStatus(e.message),
                        );
                      }}
                    >
                      Resume saved job
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {assets.length > 0 && (
          <>
            <h3>Generated game library</h3>
            <p>
              Technical validation passed. Anatomical placement and deformation
              still need visual inspection; no automatic quality guarantee is
              implied.
            </p>
            <ul>
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    onClick={() => {
                      void preloadGeneratedAsset(asset.creature)
                        .then(() => onSelect(asset.creature))
                        .catch((e) => setStatus(e.message));
                    }}
                  >
                    {asset.creature.spec.name} · {asset.creature.spec.seed} ·
                    inspect mesh
                  </button>{' '}
                  <a href={`${base}${asset.model}`} download>
                    Download rigged GLB
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
