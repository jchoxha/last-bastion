'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

type MotionKit = {
  id: string;
  label: string;
  mode: 'authored' | 'hybrid' | 'composite' | 'procedural';
  model?: string;
  sha256?: string;
  bones?: number;
  clips?: string[];
  procedural: string[];
};
type Manifest = { version: 1; kits: MotionKit[] };

function motionKitBase() {
  return new URL(
    location.pathname.includes('/playable/')
      ? '../public/motion-kits/'
      : './motion-kits/',
    location.href,
  ).href;
}

function describeMode(mode: MotionKit['mode']) {
  return {
    authored: 'Imported animation clips',
    hybrid: 'Imported clips plus runtime motion',
    composite: 'Composite skeleton contract',
    procedural: 'Runtime motion contract',
  }[mode];
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material]) {
      material.map?.dispose();
      material.normalMap?.dispose();
      material.roughnessMap?.dispose();
      material.metalnessMap?.dispose();
      material.dispose();
    }
  });
}

function MotionPreview({ kit }: { kit: MotionKit }) {
  const host = useRef<HTMLDivElement>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const clipsRef = useRef<THREE.AnimationClip[]>([]);
  const helperRef = useRef<THREE.SkeletonHelper | null>(null);
  const playbackRef = useRef({ paused: false, speed: 1 });
  const skeletonRef = useRef(false);
  const [error, setError] = useState('');
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [selectedClip, setSelectedClip] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [skeleton, setSkeleton] = useState(false);

  function play(index: number) {
    const mixer = mixerRef.current;
    const clip = clipsRef.current[index];
    if (!mixer || !clip) return;
    actionRef.current?.stop();
    const action = mixer.clipAction(clip).reset();
    action.setLoop(THREE.LoopRepeat, Infinity).play();
    actionRef.current = action;
    setSelectedClip(index);
  }

  useEffect(() => {
    if (!host.current || !kit.model || !kit.sha256) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() =>
        setError('3D preview is unavailable on this device.'),
      );
      return;
    }
    element.appendChild(renderer.domElement);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(3.7, 2.5, 4.3);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enablePan = false;
    controls.minDistance = 1.3;
    controls.maxDistance = 12;
    controls.update();
    scene.add(new THREE.HemisphereLight(0xd4efff, 0x34362f, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    scene.add(light);
    const grid = new THREE.GridHelper(6, 12, 0x54766c, 0x253c37);
    scene.add(grid);
    const resize = new ResizeObserver(() => {
      const width = Math.max(element.clientWidth, 1);
      const height = Math.max(element.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    let root: THREE.Object3D | undefined;
    let helper: THREE.SkeletonHelper | undefined;
    let disposed = false;
    let raf = 0;
    let previous = performance.now();
    const render = (now: number) => {
      const playback = playbackRef.current;
      mixerRef.current?.update(
        playback.paused
          ? 0
          : Math.min((now - previous) / 1000, 0.1) * playback.speed,
      );
      previous = now;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    void (async () => {
      try {
        const response = await fetch(new URL(kit.model!, motionKitBase()), {
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) throw Error('The mesh file could not be downloaded.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        )
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        if (digest !== kit.sha256)
          throw Error('The mesh file did not pass its checksum.');
        const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
        if (disposed) return;
        root = clone(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(root);
        const size = bounds.getSize(new THREE.Vector3());
        root.scale.setScalar(2.4 / Math.max(size.x, size.y, size.z, 0.01));
        const centered = new THREE.Box3().setFromObject(root);
        root.position.x -= (centered.min.x + centered.max.x) / 2;
        root.position.z -= (centered.min.z + centered.max.z) / 2;
        root.position.y -= centered.min.y;
        scene.add(root);
        helper = new THREE.SkeletonHelper(root);
        helper.visible = skeletonRef.current;
        helperRef.current = helper;
        scene.add(helper);
        const mixer = new THREE.AnimationMixer(root);
        mixerRef.current = mixer;
        clipsRef.current = gltf.animations;
        setClipNames(
          gltf.animations.map((clip) => clip.name || 'Unnamed clip'),
        );
        if (gltf.animations[0]) {
          const action = mixer.clipAction(gltf.animations[0]).reset();
          action.setLoop(THREE.LoopRepeat, Infinity).play();
          actionRef.current = action;
        }
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error
              ? cause.message
              : 'The mesh preview could not be loaded.',
          );
      }
    })();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      helper?.dispose();
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
      clipsRef.current = [];
      if (root) disposeObject(root);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [kit.id, kit.model, kit.sha256]);

  useEffect(() => {
    skeletonRef.current = skeleton;
    if (helperRef.current) helperRef.current.visible = skeleton;
  }, [skeleton]);

  if (!kit.model) {
    const description =
      kit.mode === 'composite'
        ? 'This family combines compatible upper and lower body rigs after anatomy validation.'
        : 'This family is animated from its body contract at runtime; it has no single donor mesh to preview.';
    return (
      <div className="motion-contract">
        <p>{description}</p>
        <p>
          Planned states: <b>{kit.procedural.join(', ')}</b>
        </p>
      </div>
    );
  }
  return (
    <>
      <div
        className="forge-preview motion-preview"
        ref={host}
        aria-label={`${kit.label} motion preview`}
      >
        {error && <p role="alert">{error}</p>}
      </div>
      <fieldset
        className="forge-tools"
        aria-label="Motion library playback controls"
      >
        <label>
          Animation
          <select
            value={selectedClip}
            disabled={clipNames.length === 0}
            onChange={(event) => play(Number(event.target.value))}
          >
            {clipNames.map((name, index) => (
              <option key={`${name}-${index}`} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Playback speed
          <select
            value={speed}
            onChange={(event) => {
              const next = Number(event.target.value);
              playbackRef.current.speed = next;
              setSpeed(next);
            }}
          >
            {[0.25, 0.5, 1, 1.5].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={clipNames.length === 0}
          onClick={() => {
            const next = !playbackRef.current.paused;
            playbackRef.current.paused = next;
            setPaused(next);
          }}
        >
          {paused ? 'Play animation' : 'Pause animation'}
        </button>
        <label className="forge-check">
          <input
            type="checkbox"
            checked={skeleton}
            onChange={(event) => setSkeleton(event.target.checked)}
          />
          Show skeleton
        </label>
        <small>
          Drag to orbit. This is a donor-rig inspection tool; it does not alter
          the selected creature.
        </small>
      </fieldset>
    </>
  );
}

export default function MotionLibrary() {
  const [kits, setKits] = useState<MotionKit[]>([]);
  const [selectedId, setSelectedId] = useState('humanoid-biped');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch(new URL('index.json', motionKitBase()), {
      signal: AbortSignal.timeout(10000),
    })
      .then(async (response) => {
        if (!response.ok) throw Error('The motion library is unavailable.');
        const value = (await response.json()) as Partial<Manifest>;
        if (
          value.version !== 1 ||
          !Array.isArray(value.kits) ||
          value.kits.length < 19 ||
          value.kits.length > 32
        )
          throw Error('The motion library manifest is invalid.');
        return value.kits as MotionKit[];
      })
      .then((value) => {
        if (active) setKits(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'The motion library could not be loaded.',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  const kit = kits.find((value) => value.id === selectedId) || kits[0];
  return (
    <section
      className="forge-panel motion-library"
      aria-labelledby="motion-library-title"
    >
      <h2 id="motion-library-title">Creature motion library</h2>
      <p className="forge-note">
        Every current body family is represented here. Imported donor rigs are
        available for inspection; composite and runtime entries record the
        required motion contract before a generated creature can use them.
      </p>
      {error && <p role="alert">{error}</p>}
      {kit && (
        <>
          <label>
            Body family
            <select
              value={kit.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {kits.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>
          <div className="motion-library-summary">
            <span>{describeMode(kit.mode)}</span>
            {kit.bones !== undefined && <span>{kit.bones} bones</span>}
            {kit.clips && <span>{kit.clips.length} imported clips</span>}
            {kit.procedural.length > 0 && (
              <span>{kit.procedural.length} runtime states</span>
            )}
          </div>
          <MotionPreview key={kit.id} kit={kit} />
        </>
      )}
    </section>
  );
}
