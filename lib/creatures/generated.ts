import * as THREE from 'three';
import { CREATURE_MOTIONS, type CreatureMotion } from './motions';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeCreature, type Creature } from './core';
import { createCreatureActor as prototypeActor } from './actor';

export type GeneratedAsset = {
  id: string;
  creature: Creature;
  model: string;
  portrait: string;
  sha256: string;
  walkClip: number;
  yaw: number;
  report: {
    triangles: number;
    bones: number;
    visualReview: string;
    clips?: string[];
  };
};
type RecordAsset = {
  asset: GeneratedAsset;
  base: string;
  loaded?: Promise<GLTF>;
};
const records = new Map<string, RecordAsset>();
export function generatedAsset(id: string) {
  return records.get(id)?.asset;
}
export function generatedCreatures() {
  return [...records.values()]
    .map((entry) => entry.asset.creature)
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function assetBase() {
  return new URL(
    location.pathname.includes('/playable/')
      ? '../public/creatures/'
      : './creatures/',
    location.href,
  ).href;
}
export async function refreshGeneratedAssets(
  base = assetBase(),
  preferSource = false,
): Promise<GeneratedAsset[]> {
  const response = await fetch(new URL('index.json', base), {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error('Generated asset library is unavailable.');
  const data = (await response.json()) as {
    version: number;
    assets: GeneratedAsset[];
  };
  if (
    data.version !== 1 ||
    !Array.isArray(data.assets) ||
    data.assets.length > 48
  )
    throw Error('Invalid generated asset library.');
  const validated: GeneratedAsset[] = data.assets.map((raw: GeneratedAsset) => {
    const creature = makeCreature(raw.creature?.spec);
    if (
      raw.creature.id !== creature.id ||
      !/^asset_[a-f0-9]{24}$/.test(raw.id) ||
      raw.model !== `${raw.id}.glb` ||
      raw.portrait !== `${raw.id}.png` ||
      !/^[a-f0-9]{64}$/.test(raw.sha256) ||
      !Number.isFinite(raw.yaw) ||
      !Number.isInteger(raw.walkClip) ||
      raw.walkClip < 0 ||
      raw.walkClip > 23
    )
      throw Error('Invalid generated asset entry.');
    return { ...raw, creature };
  });
  const ids = new Set(validated.map((asset) => asset.creature.id));
  if (ids.size !== validated.length)
    throw Error('Duplicate generated creature IDs.');
  for (const [id, record] of records)
    if (record.base === base && !ids.has(id)) records.delete(id);
  for (const asset of validated) {
    const old = records.get(asset.creature.id);
    if (
      !preferSource &&
      old?.base === 'http://127.0.0.1:8790/assets/' &&
      base !== old.base
    )
      continue;
    if (old?.asset.id !== asset.id || old.base !== base)
      records.set(asset.creature.id, { asset, base });
  }
  return validated;
}
let initial: Promise<unknown> | undefined;
export function initializeGeneratedAssets() {
  if (!initial) {
    let base = assetBase();
    try {
      if (
        localStorage.getItem('last-bastion-asset-source') ===
        'http://127.0.0.1:8790'
      )
        base = 'http://127.0.0.1:8790/assets/';
    } catch {
      /* optional preference */
    }
    initial = refreshGeneratedAssets(base).catch(() =>
      refreshGeneratedAssets().catch(() => []),
    );
  }
  return initial;
}
async function load(record: RecordAsset) {
  if (!record.loaded)
    record.loaded = (async () => {
      const response = await fetch(new URL(record.asset.model, record.base), {
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok || !response.body)
        throw Error('Generated mesh download failed.');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 32 * 1024 * 1024)
            throw Error('Generated mesh exceeds the size budget.');
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (digest !== record.asset.sha256)
        throw Error('Generated mesh checksum mismatch.');
      return new GLTFLoader().parseAsync(bytes.buffer, '');
    })().catch((error) => {
      record.loaded = undefined;
      throw error;
    });
  return record.loaded;
}
export async function preloadGeneratedAsset(creature: Creature) {
  const record = records.get(creature.id);
  if (!record) throw Error('Generated creature is not installed.');
  await load(record);
}
export function createRuntimeCreatureActor(creature: Creature) {
  const fallback = prototypeActor(creature);
  const group = new THREE.Group();
  group.add(fallback.group);
  const ownedMaterials = new Set<THREE.Material>();
  let mesh: THREE.Mesh = fallback.mesh,
    disposed = false,
    mixer: THREE.AnimationMixer | undefined;
  let model: THREE.Object3D | undefined,
    motion: CreatureMotion | 'rest' = 'idle',
    walk: THREE.AnimationClip | undefined;
  let state = 'prototype';
  let previewClips: THREE.AnimationClip[] = [],
    previewClipIndex = 0;
  let currentAction: THREE.AnimationAction | undefined;
  let fadingAction: THREE.AnimationAction | undefined;
  let fadeLeft = 0;
  function playClip(clip: THREE.AnimationClip | undefined, immediate = false) {
    if (!mixer) return;
    fadingAction?.stop();
    fadingAction = undefined;
    if (!clip) {
      mixer.stopAllAction();
      currentAction = undefined;
      return;
    }
    const next = mixer.clipAction(clip);
    const loop = CREATURE_MOTIONS[clip.name as CreatureMotion]?.loop ?? true;
    if (currentAction && currentAction !== next && !immediate) {
      fadingAction = currentAction;
      fadingAction.fadeOut(0.12);
      fadeLeft = 0.12;
    } else currentAction?.stop();
    currentAction = next
      .reset()
      .setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    currentAction.clampWhenFinished = !loop;
    currentAction.setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (fadingAction) currentAction.fadeIn(0.12);
    mixer.update(0);
  }
  function setAnimation(next: CreatureMotion | 'rest', restart = false) {
    if (motion === next && !restart) return;
    motion = next;
    if (!mixer) {
      fallback.setAnimation(
        next === 'rest'
          ? 'rest'
          : ['walk', 'run', 'charge'].includes(next)
            ? 'walk'
            : 'idle',
      );
      return;
    }
    const clip =
      next === 'rest'
        ? undefined
        : previewClips.find((c) => c.name === next) ||
          (['walk', 'run', 'charge'].includes(next) ? walk : undefined);
    if (clip) previewClipIndex = previewClips.indexOf(clip);
    playClip(clip);
  }
  const playCurrent = () => {
    const clip =
      motion === 'rest'
        ? undefined
        : previewClips.find((c) => c.name === motion) ||
          (motion === 'walk' ? walk : undefined);
    if (clip) previewClipIndex = previewClips.indexOf(clip);
    playClip(clip, true);
  };
  void (async () => {
    await initializeGeneratedAssets();
    const record = records.get(creature.id);
    if (!record || disposed) return;
    state = 'loading';
    try {
      const gltf = await load(record);
      if (disposed) return;
      const content = clone(gltf.scene);
      model = new THREE.Group();
      model.add(content);
      model.rotation.y = record.asset.yaw;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model),
        size = box.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(longest) || longest <= 0)
        throw Error('Invalid model bounds.');
      const scale = (creature.stats.radius * 3.6) / longest;
      model.scale.multiplyScalar(scale);
      model.updateMatrixWorld(true);
      const scaled = new THREE.Box3().setFromObject(model),
        center = scaled.getCenter(new THREE.Vector3());
      model.position.add(
        new THREE.Vector3(-center.x, -scaled.min.y, -center.z),
      );
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const own = (material: THREE.Material) => {
            const copy =
              material instanceof THREE.MeshBasicMaterial
                ? new THREE.MeshStandardMaterial({
                    map: material.map,
                    color: material.color,
                    side: material.side,
                  })
                : material.clone();
            ownedMaterials.add(copy);
            return copy;
          };
          obj.material = Array.isArray(obj.material)
            ? obj.material.map(own)
            : own(obj.material);
        }
        if (obj instanceof THREE.SkinnedMesh) {
          mesh = obj;
          obj.frustumCulled = false;
          obj.castShadow = true;
        }
      });
      previewClips = gltf.animations;
      previewClipIndex = record.asset.walkClip;
      walk = previewClips[previewClipIndex];
      if (!walk || mesh === fallback.mesh)
        throw Error('Generated model has no working skin or walk clip.');
      mixer = new THREE.AnimationMixer(content);
      playCurrent();
      group.remove(fallback.group);
      fallback.dispose();
      group.add(model);
      state = 'generated';
    } catch {
      mesh = fallback.mesh;
      mixer = undefined;
      model?.traverse((obj) => {
        if (obj instanceof THREE.SkinnedMesh) obj.skeleton.dispose();
      });
      for (const material of ownedMaterials) material.dispose();
      ownedMaterials.clear();
      state = 'failed';
      group.userData.assetError =
        'Generated model failed to load; using the labeled prototype fallback.';
    }
  })();
  return {
    group,
    get mesh() {
      return mesh;
    },
    get state() {
      return state;
    },
    setAnimation,
    get previewClips() {
      return previewClips.map((clip, index) => ({
        index,
        name: clip.name || `Clip ${index + 1}`,
      }));
    },
    get previewClipIndex() {
      return previewClipIndex;
    },
    hasAnimation(name: CreatureMotion) {
      return previewClips.some((c) => c.name === name);
    },
    get motion() {
      return motion;
    },
    get turning() {
      return {
        maxTurnSpeed: Math.PI * 1.5,
        minRadius: creature.stats.radius * 2,
      };
    },
    animationDuration(name: CreatureMotion) {
      return previewClips.find((c) => c.name === name)?.duration || 0;
    },
    selectPreviewClip(index: number) {
      if (!mixer || !Number.isInteger(index) || !previewClips[index]) return;
      previewClipIndex = index;
      const clip = previewClips[index];
      motion = (
        clip.name in CREATURE_MOTIONS ? clip.name : 'walk'
      ) as CreatureMotion;
      playClip(clip, true);
    },
    get playback() {
      if (!mixer) return { ...fallback.playback, loop: true, finished: false };
      const duration = currentAction?.getClip().duration || 0,
        time = currentAction?.time || 0;
      const loop = currentAction?.loop !== THREE.LoopOnce;
      return {
        duration,
        time,
        loop,
        finished: !loop && duration > 0 && time >= duration - 1e-6,
      };
    },
    seekAnimation(seconds: number) {
      if (!mixer) {
        fallback.seekAnimation(seconds);
        return;
      }
      if (!currentAction || !Number.isFinite(seconds)) return;
      const duration = currentAction.getClip().duration;
      const loop = currentAction.loop !== THREE.LoopOnce;
      const wrapped = loop
        ? ((seconds % duration) + duration) % duration
        : Math.max(0, Math.min(duration, seconds));
      currentAction.paused = false;
      currentAction.time =
        loop && (wrapped < 1e-8 || duration - wrapped < 1e-8) ? 0 : wrapped;
      fadingAction?.stop();
      fadingAction = undefined;
      currentAction.stopFading().setEffectiveWeight(1);
      mixer.update(0);
    },
    update(dt: number) {
      if (mixer) {
        const step = Math.max(0, Math.min(dt, 0.1));
        mixer.update(step);
        if (fadingAction && (fadeLeft -= step) <= 0) {
          fadingAction.stop();
          fadingAction = undefined;
        }
      } else fallback.update(dt);
    },
    dispose() {
      disposed = true;
      if (mixer && model) {
        mixer.stopAllAction();
        mixer.uncacheRoot(mixer.getRoot());
        model.traverse((obj) => {
          if (obj instanceof THREE.SkinnedMesh) obj.skeleton.dispose();
        });
      } else fallback.dispose();
      for (const material of ownedMaterials) material.dispose();
      // Geometry and textures belong to the cached source GLTF; hit-flash materials are private.
    },
  };
}
