import * as THREE from 'three';
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
  report: { triangles: number; bones: number; visualReview: string };
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
      raw.walkClip > 11
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
    motion: 'rest' | 'idle' | 'walk' = 'idle',
    walk: THREE.AnimationClip | undefined;
  let state = 'prototype';
  function setAnimation(next: 'rest' | 'idle' | 'walk') {
    if (motion === next) return;
    motion = next;
    if (!mixer || !walk) {
      fallback.setAnimation(next);
      return;
    }
    mixer.stopAllAction();
    // Quadruped provider currently supplies walk only. Rest is honest idle until an idle clip exists.
    if (next === 'walk') mixer.clipAction(walk).reset().play();
  }
  const playCurrent = () => {
    if (motion === 'walk' && mixer && walk) mixer.clipAction(walk).play();
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
      walk = gltf.animations[record.asset.walkClip];
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
    update(dt: number) {
      if (mixer) mixer.update(Math.min(dt, 0.1));
      else fallback.update(dt);
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
