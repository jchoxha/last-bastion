'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCreatureActor, rigJoints } from '@/lib/creatures/actor';
import {
  createRuntimeCreatureActor,
  generatedAsset,
} from '@/lib/creatures/generated';
import CreaturePipeline from './creature-pipeline';
import {
  ARCHETYPES,
  ATTUNEMENTS,
  BODY_PLANS,
  BODY_TYPES,
  COLLECTION_KEY,
  DEFAULT_INPUT,
  FAMILIES,
  FORMS,
  MANIFESTATIONS,
  MAX_CREATURES,
  ROLES,
  SUBTYPES,
  compatiblePlans,
  generateLocal,
  generateWithService,
  makeCreature,
  parseCollection,
  parseCreature,
  referencePrompt,
  type Creature,
  type CreatureInput,
  type BodyPlan,
} from '@/lib/creatures/core';

function download(name: string, value: string | ArrayBuffer, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Preview({
  creature,
  motion,
  bones,
}: {
  creature: Creature;
  motion: 'rest' | 'idle' | 'walk';
  bones: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const actorRef = useRef<ReturnType<typeof createRuntimeCreatureActor> | null>(
    null,
  );
  const helperRef = useRef<THREE.SkeletonHelper | null>(null);
  const clockRef = useRef<HTMLOutputElement>(null);
  const playbackRef = useRef({ paused: false, speed: 1 });
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hasClip, setHasClip] = useState(false);
  const [clips, setClips] = useState<{ index: number; name: string }[]>([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [error, setError] = useState('');
  function pause(value: boolean) {
    playbackRef.current.paused = value;
    setPaused(value);
  }
  function step(direction: number) {
    pause(true);
    const actor = actorRef.current;
    if (actor) actor.seekAnimation(actor.playback.time + direction / 30);
  }
  useEffect(() => {
    if (!host.current || creature.assets.model !== 'prototype') return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      // WebGL availability is only known after browser initialization is attempted.
      // eslint-disable-next-line react/react-compiler
      setError(
        '3D preview is unavailable on this device. You can still export the definition.',
      );
      return;
    }
    const element = host.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
    camera.position.set(3.7, 2.5, 4.3);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enablePan = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 9;
    controls.update();
    scene.add(new THREE.HemisphereLight(0xd4efff, 0x34362f, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    scene.add(light);
    const actor = createRuntimeCreatureActor(creature);
    actorRef.current = actor;
    scene.add(actor.group);
    let helper = new THREE.SkeletonHelper(actor.group);
    helperRef.current = helper;
    helper.visible = false;
    scene.add(helper);
    const grid = new THREE.GridHelper(6, 12, 0x54766c, 0x253c37);
    scene.add(grid);
    const resize = new ResizeObserver(() => {
      const w = element.clientWidth,
        h = element.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    let previousState = actor.state;
    let previousHasClip = false;
    let raf = 0,
      last = performance.now();
    const frame = (now: number) => {
      const playback = playbackRef.current;
      actor.update(
        playback.paused
          ? 0
          : Math.min((now - last) / 1000, 0.1) * playback.speed,
      );
      const position = actor.playback;
      const available = position.duration > 0;
      if (available !== previousHasClip) {
        previousHasClip = available;
        setHasClip(available);
      }
      element.dataset.animationTime = String(position.time);
      element.dataset.animationDuration = String(position.duration);
      if (clockRef.current)
        clockRef.current.value = available
          ? `${position.time.toFixed(2)} / ${position.duration.toFixed(2)} s`
          : 'Static pose — no animation clip';
      element.dataset.assetState = actor.state;
      if (actor.state !== previousState) {
        previousState = actor.state;
        setClips(actor.state === 'generated' ? actor.previewClips : []);
        setClipIndex(actor.previewClipIndex);
        const visible = helper.visible;
        scene.remove(helper);
        helper.dispose();
        helper = new THREE.SkeletonHelper(actor.group);
        helper.visible = visible;
        helperRef.current = helper;
        scene.add(helper);
        if (actor.state === 'failed')
          setError(
            'Generated asset unavailable. Showing the procedural prototype fallback.',
          );
      }
      last = now;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      actor.dispose();
      helper.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      actorRef.current = null;
      helperRef.current = null;
    };
  }, [creature]);
  useEffect(() => {
    actorRef.current?.setAnimation(motion);
    if (helperRef.current) helperRef.current.visible = bones;
  }, [creature, motion, bones]);
  return (
    <>
      <div
        className="forge-preview"
        ref={host}
        aria-label="Interactive creature preview"
      >
        {error && <p role="alert">{error}</p>}
        {creature.assets.model !== 'prototype' && (
          <p>
            This body plan is a concept only.
            <br />A rig must be built before 3D preview or spawning.
          </p>
        )}
      </div>
      {creature.assets.model === 'prototype' && (
        <fieldset
          className="forge-tools"
          aria-label="Animation playback controls"
        >
          {clips.length > 1 && (
            <label style={{ flexBasis: '100%', minWidth: 0 }}>
              Walk clip (preview)
              <select
                style={{ maxWidth: '100%' }}
                disabled={motion !== 'walk'}
                value={clipIndex}
                onChange={(e) => {
                  const index = Number(e.target.value);
                  actorRef.current?.selectPreviewClip(index);
                  setClipIndex(index);
                }}
              >
                {clips.map((clip) => (
                  <option key={clip.index} value={clip.index}>
                    {clip.name}
                  </option>
                ))}
              </select>
              <small>
                Select walk motion to compare clips. This selection does not
                change the game’s default animation.
              </small>
            </label>
          )}
          <label>
            Playback speed
            <select
              value={speed}
              onChange={(e) => {
                const next = Number(e.target.value);
                playbackRef.current.speed = next;
                setSpeed(next);
              }}
            >
              {[0.1, 0.25, 0.5, 1].map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <button disabled={!hasClip} onClick={() => pause(!paused)}>
            {paused ? 'Play animation' : 'Pause animation'}
          </button>
          <button disabled={!hasClip} onClick={() => step(-1)}>
            Previous frame
          </button>
          <button disabled={!hasClip} onClick={() => step(1)}>
            Next frame
          </button>
          <button
            disabled={!hasClip}
            onClick={() => {
              pause(true);
              actorRef.current?.seekAnimation(0);
            }}
          >
            Restart clip
          </button>
          <output ref={clockRef} aria-label="Animation position" />
          <small>
            Frame steps sample 1/30 second of the clip and pause playback. Drag
            to inspect paws and joints from different angles. These controls
            affect the preview only.
          </small>
        </fieldset>
      )}
    </>
  );
}

export default function CreatureForge({
  onClose,
  onSpawn,
  canSpawn,
}: {
  onClose: () => void;
  onSpawn: (creature: Creature) => string;
  canSpawn: boolean;
}) {
  const [input, setInput] = useState<CreatureInput>(DEFAULT_INPUT);
  const [creature, setCreature] = useState(() => generateLocal(DEFAULT_INPUT));
  const [library, setLibrary] = useState<Creature[]>([]),
    [storageReady, setStorageReady] = useState(false);
  const [status, setStatus] = useState(
    'Local generation works offline. AI authoring is optional.',
  );
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8788/creatures');
  const [busy, setBusy] = useState(false),
    [motion, setMotion] = useState<'rest' | 'idle' | 'walk'>('idle'),
    [bones, setBones] = useState(false);
  const cancel = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    try {
      const raw = localStorage.getItem(COLLECTION_KEY);
      // Load browser storage after hydration, like the game's save menu.
      // eslint-disable-next-line react/react-compiler
      setLibrary(raw ? parseCollection(raw) : []);
      setStorageReady(true);
    } catch {
      setStatus(
        'Saved creature library could not be read. Saving is disabled to protect it; export your current creature instead.',
      );
    }
    return () => cancel.current?.abort();
  }, []);
  const change = (patch: Partial<CreatureInput>) =>
    setInput((previous) => {
      const next = { ...previous, ...patch };
      next.family = next.bodies.includes('Beast')
        ? next.family || 'Mammalian'
        : '';
      next.manifestation = next.bodies.includes('Aberration')
        ? next.manifestation || 'Eldritch'
        : '';
      next.archetype = next.bodies.includes('Humanoid')
        ? next.archetype || 'Warrior'
        : '';
      const plans = compatiblePlans(next.bodies, next.family);
      if (!plans.includes(next.bodyPlan)) next.bodyPlan = plans[0];
      return next;
    });
  const select = (
    label: string,
    value: string,
    values: readonly string[],
    update: (value: string) => void,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => update(e.target.value)}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {v || 'None'}
          </option>
        ))}
      </select>
    </label>
  );
  const localGenerate = () => {
    try {
      setCreature(generateLocal(input));
      setStatus(
        'Definition generated locally. Preview uses a procedural prototype, not an AI mesh.',
      );
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  const aiGenerate = async () => {
    const controller = new AbortController();
    cancel.current = controller;
    setBusy(true);
    setStatus('Authoring a creature through your configured service…');
    try {
      setCreature(
        await generateWithService(input, endpoint, controller.signal),
      );
      setStatus(
        'AI-authored definition validated. Stats and body-plan rules are controlled by the game.',
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setStatus(
          `Generation failed: ${(e as Error).message}. Your current creature is unchanged.`,
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const save = () => {
    const next = [...library.filter((c) => c.id !== creature.id), creature];
    if (next.length > MAX_CREATURES) {
      setStatus(
        `Library limit reached (${MAX_CREATURES}). Export or remove a creature first.`,
      );
      return;
    }
    try {
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
      setLibrary(next);
      setStatus(
        `${creature.spec.name} saved on this device. Export JSON to keep a portable copy.`,
      );
    } catch {
      setStatus(
        'Library could not be saved. Storage may be full; export JSON to keep this creature.',
      );
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 16000) throw Error('Creature file exceeds 16 KB.');
      const result = parseCreature(await file.text());
      setCreature(result);
      setInput(result.spec);
      setStatus('Creature imported and validated. Save to library to keep it.');
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  const exportRig = async () => {
    const actor = createCreatureActor(creature);
    actor.setAnimation('rest');
    actor.group.updateMatrixWorld(true);
    try {
      const result = await new GLTFExporter().parseAsync(actor.group, {
        binary: true,
        animations: actor.clips,
      });
      download(
        `${creature.id}-prototype.glb`,
        result as ArrayBuffer,
        'model/gltf-binary',
      );
      setStatus(
        'Prototype GLB exported with named bones, rigid weights, and idle/walk clips. Organic skinning and attack animations still need production work.',
      );
    } catch (e) {
      setStatus(`Rig export failed: ${(e as Error).message}`);
    } finally {
      actor.dispose();
    }
  };
  const ready = creature.assets.model === 'prototype';
  const generated = generatedAsset(creature.id);
  return (
    <main className="creature-forge">
      <header className="forge-header">
        <div>
          <span className="forge-kicker">CHIMERA × LAST BASTION</span>
          <h1 ref={heading} tabIndex={-1}>
            Creature forge
          </h1>
          <p>
            Generate meshes from Chimera art, inspect their rigs, and test them
            in the game.
          </p>
        </div>
        <button onClick={onClose}>Back to menu</button>
      </header>
      <CreaturePipeline
        onSelect={(next) => {
          setCreature(next);
          setStatus(
            'Generated mesh selected. Inspect walk and skeleton before testing it in the run.',
          );
          if (storageReady) {
            const collection = [
              ...library.filter((c) => c.id !== next.id),
              next,
            ];
            if (collection.length <= MAX_CREATURES) {
              try {
                localStorage.setItem(
                  COLLECTION_KEY,
                  JSON.stringify(collection),
                );
                setLibrary(collection);
              } catch {
                setStatus(
                  'Mesh loaded, but this device could not save the creature library.',
                );
              }
            }
          }
        }}
      />
      <div className="forge-layout">
        <section className="forge-panel">
          <h2>Creature blueprint</h2>
          <fieldset disabled={busy}>
            <label>
              Concept
              <textarea
                value={input.concept}
                maxLength={500}
                onChange={(e) => change({ concept: e.target.value })}
              />
            </label>
            <label>
              Generation seed
              <input
                value={input.seed}
                maxLength={80}
                onChange={(e) => change({ seed: e.target.value })}
              />
            </label>
            <div className="forge-fields">
              {select('Body type', input.bodies[0], BODY_TYPES, (body) =>
                change({ bodies: [body] }),
              )}
              {select(
                'Hybrid body',
                input.bodies[1] || '',
                ['', ...BODY_TYPES.filter((b) => b !== input.bodies[0])],
                (body) =>
                  change({
                    bodies: body ? [input.bodies[0], body] : [input.bodies[0]],
                  }),
              )}
              {input.bodies.includes('Beast') &&
                select('Family', input.family, FAMILIES, (family) =>
                  change({ family }),
                )}
              {input.bodies.includes('Aberration') &&
                select(
                  'Manifestation',
                  input.manifestation,
                  MANIFESTATIONS,
                  (manifestation) => change({ manifestation }),
                )}
              {input.bodies.includes('Humanoid') &&
                select('Archetype', input.archetype, ARCHETYPES, (archetype) =>
                  change({ archetype }),
                )}
              {select('Attunement', input.attunements[0], ATTUNEMENTS, (att) =>
                change({ attunements: [att] }),
              )}
              {select(
                'Second attunement',
                input.attunements[1] || '',
                ['', ...ATTUNEMENTS.filter((a) => a !== input.attunements[0])],
                (att) =>
                  change({
                    attunements: att
                      ? [input.attunements[0], att]
                      : [input.attunements[0]],
                  }),
              )}
              {select('Form', input.form, FORMS, (form) => change({ form }))}
              {select('Combat role', input.role, ROLES, (role) =>
                change({ role }),
              )}
            </div>
            <label>
              Physical body plan
              <select
                value={input.bodyPlan}
                onChange={(e) =>
                  change({ bodyPlan: e.target.value as BodyPlan })
                }
              >
                {compatiblePlans(input.bodies, input.family).map((p) => (
                  <option key={p} value={p}>
                    {BODY_PLANS[p].label}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary>Descriptive subtypes ({input.subtypes.length})</summary>
              <div className="forge-tags">
                {SUBTYPES.map((s) => (
                  <label key={s}>
                    <input
                      type="checkbox"
                      checked={input.subtypes.includes(s)}
                      onChange={(e) =>
                        change({
                          subtypes: e.target.checked
                            ? [...input.subtypes, s]
                            : input.subtypes.filter((v) => v !== s),
                        })
                      }
                    />
                    {s}
                  </label>
                ))}
              </div>
            </details>
            <button className="forge-primary" onClick={localGenerate}>
              Generate locally
            </button>
            <details>
              <summary>Optional AI authoring service</summary>
              <p>
                Authors names, descriptions and colors. It does not generate
                meshes. Your concept and selections are sent only when you press
                the button below. Keep provider keys on the service.
              </p>
              <label>
                Service URL
                <input
                  type="url"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
              </label>
              <button onClick={aiGenerate}>Generate through AI service</button>
            </details>
          </fieldset>
        </section>
        <section className="forge-panel forge-result">
          <div className="forge-result-title">
            <div>
              <span className="forge-kicker">
                {generated
                  ? 'GENERATED MESH · RIG NEEDS VISUAL REVIEW'
                  : ready
                    ? 'PROTOTYPE RIG'
                    : 'CONCEPT ONLY'}
              </span>
              <h2>{creature.spec.name}</h2>
            </div>
            <span className="forge-badge">{creature.spec.form}</span>
          </div>
          <Preview creature={creature} motion={motion} bones={bones} />
          {ready && (
            <div className="forge-tools">
              {select('Preview motion', motion, ['rest', 'idle', 'walk'], (v) =>
                setMotion(v as typeof motion),
              )}
              <label className="forge-check">
                <input
                  type="checkbox"
                  checked={bones}
                  onChange={(e) => setBones(e.target.checked)}
                />
                Show skeleton
              </label>
            </div>
          )}
          <p>{creature.spec.description}</p>
          <p className="forge-meta">
            {creature.spec.bodies.join(' + ')} ·{' '}
            {creature.spec.family ||
              creature.spec.manifestation ||
              creature.spec.archetype}{' '}
            · {creature.spec.attunements.join(' / ')}
          </p>
          <div className="forge-stats">
            <span>
              <b>{creature.stats.hp}</b> Health
            </span>
            <span>
              <b>{creature.stats.damage}</b> Damage
            </span>
            <span>
              <b>{creature.stats.speed}</b> Speed
            </span>
          </div>
          <p className="forge-note">
            Combat uses a basic melee enemy with role-based stats. Attunements,
            archetypes and subtypes describe its identity; elemental powers and
            companions are future stages. Installed generated models
            automatically enter ordinary wilderness grunt slots.
          </p>
          <div className="forge-fields">
            <label>
              Creature name
              <input
                value={creature.spec.name}
                disabled={Boolean(generated)}
                maxLength={60}
                onChange={(e) => {
                  const name = e.target.value;
                  if (name.trim())
                    setCreature(makeCreature({ ...creature.spec, name }));
                }}
              />
            </label>
            <label>
              Body color
              <input
                type="color"
                disabled={Boolean(generated)}
                value={creature.spec.color}
                onChange={(e) =>
                  setCreature(
                    makeCreature({ ...creature.spec, color: e.target.value }),
                  )
                }
              />
            </label>
          </div>
          <div className="forge-tools">
            <button disabled={!storageReady} onClick={save}>
              Save to library
            </button>
            <button
              disabled={!ready || !canSpawn || busy}
              onClick={() => {
                try {
                  setStatus(onSpawn(creature));
                } catch (e) {
                  setStatus((e as Error).message);
                }
              }}
            >
              Spawn test enemy
            </button>
          </div>
          <p className="forge-note">
            {canSpawn
              ? 'Spawns a hostile creature near you in the paused run. Resume when ready to fight; the creature is included in run saves.'
              : 'Start a game and choose your class, then return here to test an enemy.'}
          </p>
          <details>
            <summary>Export and asset pipeline</summary>
            <ol>
              <li>Definition: validated.</li>
              <li>
                Rig:{' '}
                {generated
                  ? 'generated mesh and skin; technical validation passed, visual inspection required.'
                  : ready
                    ? 'articulated prototype; rigid skin weights.'
                    : 'not implemented for this plan.'}
              </li>
              <li>
                Reference art: generate from the exported brief and approved rig
                views.
              </li>
              <li>
                Mesh:{' '}
                {generated
                  ? 'installed by the Chimera model pipeline.'
                  : 'use the Chimera model pipeline above to generate a mesh.'}
              </li>
              <li>
                Production rig: weight, animation, and performance review
                required.
              </li>
            </ol>
            <div className="forge-tools">
              <button
                onClick={() =>
                  download(
                    `${creature.id}.json`,
                    JSON.stringify(creature, null, 2),
                    'application/json',
                  )
                }
              >
                Export creature JSON
              </button>
              <button
                onClick={() =>
                  download(
                    `${creature.id}-reference.txt`,
                    referencePrompt(creature),
                    'text/plain',
                  )
                }
              >
                Export reference brief
              </button>
              {ready && !generated && (
                <>
                  <button onClick={exportRig}>Export prototype GLB</button>
                  <button
                    onClick={() =>
                      download(
                        `${creature.id}-rig.json`,
                        JSON.stringify(
                          {
                            version: 1,
                            bodyPlan: creature.spec.bodyPlan,
                            units: 'meters',
                            up: '+Y',
                            forward: '+Z',
                            positionSpace: 'model-space rest positions',
                            skinning:
                              'prototype rigid weights; production review required',
                            joints: rigJoints(creature.spec.bodyPlan),
                            clips: ['idle', 'walk'],
                          },
                          null,
                          2,
                        ),
                        'application/json',
                      )
                    }
                  >
                    Export rig contract
                  </button>
                </>
              )}
            </div>
          </details>
        </section>
        <section className="forge-panel forge-library">
          <h2>
            Your creature library{' '}
            <small>
              {library.length}/{MAX_CREATURES}
            </small>
          </h2>
          <p>
            Stored separately from run saves. Export individual creatures to
            move them between devices.
          </p>
          <label>
            Import creature JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <div className="forge-library-list">
            {library.map((c) => (
              <div key={c.id}>
                <button
                  onClick={() => {
                    setCreature(c);
                    setInput(c.spec);
                    setStatus('Library creature selected.');
                  }}
                >
                  <strong>{c.spec.name}</strong>
                  <small>
                    {BODY_PLANS[c.spec.bodyPlan].label} · {c.spec.form}
                  </small>
                </button>
                <button
                  aria-label={`Remove ${c.spec.name} from library`}
                  onClick={() => {
                    const next = library.filter((item) => item.id !== c.id);
                    try {
                      localStorage.setItem(
                        COLLECTION_KEY,
                        JSON.stringify(next),
                      );
                      setLibrary(next);
                      setStatus(
                        'Removed from library. Existing run creatures are unchanged.',
                      );
                    } catch {
                      setStatus('Could not update library.');
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <output className="forge-status" aria-live="polite">
        {status}
      </output>
    </main>
  );
}
