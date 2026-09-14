'use client';
import { useEffect, useRef, useState } from 'react';
import { type Creature } from '@/lib/creatures/core';
import {
  refreshGeneratedAssets,
  preloadGeneratedAsset,
} from '@/lib/creatures/generated';

const REPO = 'jchoxha/last-bastion';
const WORKFLOW = `/repos/${REPO}/actions/workflows/generate-creature.yml`;
type Run = {
  id: number;
  run_number: number;
  status: string;
  conclusion: string | null;
};
// Authorization lives only in this component's memory and is sent only to api.github.com.
async function github<T>(
  token: string,
  route: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`https://api.github.com${route}`, {
    method: body ? 'POST' : 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw Error(
      `GitHub HTTP ${response.status}. Check token expiry, repository selection and Actions read/write permission.`,
    );
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export default function CreatureCloud({
  onSelect,
}: {
  onSelect: (creature: Creature) => void;
}) {
  const [credential, setCredential] = useState('');
  const token = useRef('');
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    'Generate on GitHub, even when this PC is off.',
  );
  const [runs, setRuns] = useState<Run[]>([]);
  const [rosterId, setRosterId] = useState('voltfang');
  const [bodyPlan, setBodyPlan] = useState('canine-v1'),
    [form, setForm] = useState('regular');
  const [mode, setMode] = useState('text'),
    [seed, setSeed] = useState('voltfang-text-1');
  const [description, setDescription] = useState(
    'Slate-blue wolf with cyan mane highlights, yellow eyes, muscular shoulders, pointed ears and a single bushy tail. Compact sculpted fur clumps.',
  );
  const [submitted, setSubmitted] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      token.current = '';
    };
  }, []);
  useEffect(() => {
    if (!connected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await github<{ workflow_runs: Run[] }>(
          token.current,
          `${WORKFLOW}/runs?per_page=10&event=workflow_dispatch`,
        );
        if (!stopped) setRuns(result.workflow_runs);
      } catch (e) {
        if (!stopped) setStatus((e as Error).message);
      }
      if (!stopped) timer = setTimeout(poll, 15000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [connected]);
  async function connect() {
    setBusy(true);
    try {
      const entered = credential.trim();
      const user = await github<{ login: string }>(entered, '/user');
      if (user.login.toLowerCase() !== 'jchoxha')
        throw Error(
          'Generation is restricted to the repository owner, jchoxha.',
        );
      await github(entered, WORKFLOW);
      if (!mounted.current) return;
      token.current = entered;
      setCredential('');
      setConnected(true);
      setStatus(
        'Connected to GitHub. The workflow uses the repository’s TRIPO_API_KEY secret.',
      );
    } catch (e) {
      if (mounted.current) setStatus((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function dispatch(resume = '') {
    if (busy || submitted) return;
    setBusy(true);
    setSubmitted(true);
    try {
      await github(token.current, `${WORKFLOW}/dispatches`, {
        ref: 'main',
        inputs: {
          request: JSON.stringify({
            version: 1,
            rosterId: rosterId.trim(),
            bodyPlan,
            form,
            mode,
            seed: seed.trim(),
            modelDescription: description.trim(),
          }),
          resume_run_id: resume,
        },
      });
      if (mounted.current)
        setStatus(
          'Job submitted. You can close this page. GitHub will generate, validate, commit and deploy the creature; use Refresh published creatures after deployment.',
        );
    } catch {
      if (mounted.current)
        setStatus(
          'Submission was not confirmed. Check the GitHub run list before submitting again; a lost response may still have started a paid job.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      const assets = await refreshGeneratedAssets(undefined, true);
      try {
        localStorage.removeItem('last-bastion-asset-source');
      } catch {
        /* optional preference */
      }
      if (assets.length) {
        const newest = assets[assets.length - 1];
        await preloadGeneratedAsset(newest.creature);
        if (mounted.current) onSelect(newest.creature);
      }
      if (mounted.current)
        setStatus(
          assets.length
            ? 'Published models loaded. Inspect the selected creature’s walk and skeleton.'
            : 'No published creature yet. Check generation and Pages deployment in GitHub.',
        );
    } catch (e) {
      if (mounted.current) setStatus((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className="forge-panel pipeline-panel"
      aria-label="GitHub creature generation"
    >
      <h2>Generate creatures on GitHub</h2>
      <p>
        Chimera definition → textured 3D mesh → matching rig → animation library
        → game. Compare text, direct source art and normalized source art.
      </p>
      <details>
        <summary>One-time setup</summary>
        <ol>
          <li>
            Add <strong>TRIPO_API_KEY</strong> in{' '}
            <a
              href={`https://github.com/${REPO}/settings/secrets/actions/new`}
              target="_blank"
              rel="noreferrer"
            >
              repository Actions secrets
            </a>
            . Paste the Tripo key there only.
          </li>
          <li>
            Create a{' '}
            <a
              href="https://github.com/settings/personal-access-tokens/new?name=Last%20Bastion%20Forge&target_name=jchoxha&actions=write"
              target="_blank"
              rel="noreferrer"
            >
              fine-grained GitHub token
            </a>
            : select only <strong>last-bastion</strong> and{' '}
            <strong>Actions: read and write</strong>.
          </li>
          <li>
            Enter that GitHub token below. It is cleared when you disconnect,
            reload or leave the forge.
          </li>
        </ol>
      </details>
      {!connected ? (
        <>
          <label>
            GitHub token (not your Tripo key)
            <input
              type="password"
              autoComplete="off"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
            />
          </label>
          <button disabled={busy || !credential.trim()} onClick={connect}>
            Connect GitHub
          </button>
          <p>
            Or use{' '}
            <a
              href={`https://github.com/${REPO}/actions/workflows/generate-creature.yml`}
              target="_blank"
              rel="noreferrer"
            >
              Run workflow on GitHub
            </a>{' '}
            with your existing GitHub login.
          </p>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              token.current = '';
              setCredential('');
              setConnected(false);
              setStatus('Disconnected. GitHub token cleared.');
            }}
          >
            Disconnect GitHub
          </button>
          <div className="forge-fields">
            <label>
              Chimera roster ID
              <input
                value={rosterId}
                maxLength={60}
                onChange={(e) => {
                  setRosterId(e.target.value);
                  setDescription('');
                }}
              />
            </label>
            <label>
              Model source
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="text">Text to 3D</option>
                <option value="image-direct">
                  Source art directly to 3D (0 new images)
                </option>
                <option value="image">
                  Normalize source art, then 3D (1 new image)
                </option>
              </select>
            </label>
            <label>
              Body plan
              <select
                value={bodyPlan}
                onChange={(e) => setBodyPlan(e.target.value)}
              >
                <option value="canine-v1">Canine quadruped</option>
                <option value="humanoid-v1">Humanoid biped</option>
              </select>
            </label>
            <label>
              Form
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
          {mode === 'text' && (
            <label>
              Appearance details
              <textarea
                value={description}
                maxLength={600}
                onChange={(e) => setDescription(e.target.value)}
              />
              <small>
                The worker adds neutral pose, anatomy and material constraints.
                Leave blank to use the Chimera description.
              </small>
            </label>
          )}
          <p>
            {mode === 'text'
              ? 'Estimated Tripo cost: $0.55 for standard textured mesh, rig and one walk.'
              : mode === 'image-direct'
                ? 'Estimated Tripo cost: $0.60 for direct image-to-model, rig and one walk.'
                : 'Estimated Tripo cost: $0.70 including one neutral-reference image, standard textured mesh, rig and one walk.'}{' '}
            Each new job can incur charges, including repeated seeds. Failed
            stages may already have consumed credits. Prices can change.
          </p>
          <button
            disabled={
              busy ||
              submitted ||
              !/^[a-z0-9_-]{1,60}$/.test(rosterId.trim()) ||
              !seed.trim()
            }
            onClick={() => void dispatch()}
          >
            Generate and publish creature
          </button>
          {submitted && (
            <button
              disabled={busy}
              onClick={() => {
                setSeed(`creature-${Date.now()}`);
                setSubmitted(false);
              }}
            >
              Prepare another job
            </button>
          )}
          <ul>
            {runs.map((run) => (
              <li key={run.id}>
                <a
                  href={`https://github.com/${REPO}/actions/runs/${run.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Run #{run.run_number}
                </a>
                : {run.conclusion || run.status}
                {['failure', 'cancelled', 'timed_out'].includes(
                  run.conclusion || '',
                ) && (
                  <button
                    disabled={busy || submitted}
                    onClick={() => void dispatch(String(run.id))}
                  >
                    Resume saved tasks
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p>
            Recovery requires a saved job artifact (retained 30 days). If a run
            was interrupted before saving one, check Tripo before starting
            again. Workflow success means assets were pushed and deployment
            requested; Pages may take another minute.
          </p>
        </>
      )}
      <button disabled={busy} onClick={refresh}>
        Refresh published creatures
      </button>
      <output aria-live="polite">{status}</output>
    </section>
  );
}
