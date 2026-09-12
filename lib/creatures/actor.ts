import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Creature } from './core';

export type Joint = {
  name: string;
  parent: string | null;
  position: [number, number, number];
};
export function rigJoints(plan: string): Joint[] {
  const canine = plan === 'canine-v1';
  if (!canine && plan !== 'humanoid-v1')
    throw Error('This body plan has no prototype rig yet.');
  const joints: Joint[] = canine
    ? [
        { name: 'hips', parent: null, position: [0, 1.05, -0.5] },
        { name: 'spine', parent: 'hips', position: [0, 1.15, 0.3] },
        { name: 'neck', parent: 'spine', position: [0, 1.45, 0.62] },
        { name: 'head', parent: 'neck', position: [0, 1.62, 0.95] },
        { name: 'jaw', parent: 'head', position: [0, 1.5, 1.12] },
        { name: 'tail', parent: 'hips', position: [0, 1.05, -0.85] },
        { name: 'tail_tip', parent: 'tail', position: [0, 0.95, -1.35] },
      ]
    : [
        { name: 'hips', parent: null, position: [0, 0.95, 0] },
        { name: 'spine', parent: 'hips', position: [0, 1.35, 0] },
        { name: 'neck', parent: 'spine', position: [0, 1.65, 0] },
        { name: 'head', parent: 'neck', position: [0, 1.85, 0] },
        { name: 'jaw', parent: 'head', position: [0, 1.77, 0.15] },
      ];
  for (const [side, sign] of [
    ['L', -1],
    ['R', 1],
  ] as const) {
    if (canine) {
      joints.push(
        {
          name: `front_${side}`,
          parent: 'spine',
          position: [sign * 0.28, 1.1, 0.45],
        },
        {
          name: `elbow_${side}`,
          parent: `front_${side}`,
          position: [sign * 0.28, 0.6, 0.4],
        },
        {
          name: `front_paw_${side}`,
          parent: `elbow_${side}`,
          position: [sign * 0.28, 0.13, 0.5],
        },
        {
          name: `rear_${side}`,
          parent: 'hips',
          position: [sign * 0.3, 1.02, -0.5],
        },
        {
          name: `knee_${side}`,
          parent: `rear_${side}`,
          position: [sign * 0.3, 0.65, -0.3],
        },
        {
          name: `hock_${side}`,
          parent: `knee_${side}`,
          position: [sign * 0.3, 0.3, -0.62],
        },
        {
          name: `rear_paw_${side}`,
          parent: `hock_${side}`,
          position: [sign * 0.3, 0.12, -0.5],
        },
      );
    } else {
      joints.push(
        {
          name: `arm_${side}`,
          parent: 'spine',
          position: [sign * 0.3, 1.5, 0],
        },
        {
          name: `elbow_${side}`,
          parent: `arm_${side}`,
          position: [sign * 0.53, 1.18, 0],
        },
        {
          name: `hand_${side}`,
          parent: `elbow_${side}`,
          position: [sign * 0.68, 0.85, 0.03],
        },
        {
          name: `leg_${side}`,
          parent: 'hips',
          position: [sign * 0.18, 0.95, 0],
        },
        {
          name: `knee_${side}`,
          parent: `leg_${side}`,
          position: [sign * 0.2, 0.52, 0.04],
        },
        {
          name: `foot_${side}`,
          parent: `knee_${side}`,
          position: [sign * 0.22, 0.12, 0.02],
        },
      );
    }
  }
  return joints;
}

// Deliberately simple segmented proxy: rigid per-bone weights, not final organic skinning.
export function createCreatureActor(creature: Creature) {
  const joints = rigJoints(creature.spec.bodyPlan),
    canine = creature.spec.bodyPlan === 'canine-v1';
  const group = new THREE.Group();
  group.name = creature.id;
  const bones = joints.map((j) => {
    const b = new THREE.Bone();
    b.name = j.name;
    return b;
  });
  const positions = joints.map((j) => new THREE.Vector3(...j.position));
  joints.forEach((j, i) => {
    const parent = joints.findIndex((p) => p.name === j.parent);
    bones[i].position.copy(positions[i]);
    if (parent >= 0) {
      bones[i].position.sub(positions[parent]);
      bones[parent].add(bones[i]);
    } else group.add(bones[i]);
  });
  group.updateMatrixWorld(true);
  const geometries: THREE.BufferGeometry[] = [];
  const bodyColor = new THREE.Color(creature.spec.color),
    accent = new THREE.Color(creature.spec.accent);
  function shape(
    boneName: string,
    center: THREE.Vector3,
    scale: THREE.Vector3,
    color: THREE.Color,
    rotation?: THREE.Quaternion,
  ) {
    const index = joints.findIndex((j) => j.name === boneName);
    const geometry = new THREE.SphereGeometry(1, 10, 7);
    geometry.scale(scale.x, scale.y, scale.z);
    if (rotation) geometry.applyQuaternion(rotation);
    geometry.translate(center.x, center.y, center.z);
    const count = geometry.attributes.position.count,
      indices = new Uint16Array(count * 4),
      weights = new Float32Array(count * 4),
      colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      indices[i * 4] = index;
      weights[i * 4] = 1;
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(indices, 4),
    );
    geometry.setAttribute(
      'skinWeight',
      new THREE.Float32BufferAttribute(weights, 4),
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometries.push(geometry);
  }
  joints.forEach((joint, i) => {
    if (!joint.parent) return;
    const parent = joints.findIndex((j) => j.name === joint.parent);
    const delta = positions[i].clone().sub(positions[parent]);
    const radius =
      joint.name === 'spine'
        ? 0.29
        : joint.name === 'neck'
          ? 0.24
          : joint.name.startsWith('tail')
            ? 0.13
            : 0.105;
    shape(
      joint.parent,
      positions[parent].clone().addScaledVector(delta, 0.5),
      new THREE.Vector3(radius, delta.length() * 0.57, radius),
      bodyColor,
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      ),
    );
    if (/paw|foot|hand/.test(joint.name))
      shape(
        joint.name,
        positions[i].clone().add(new THREE.Vector3(0, 0, 0.07)),
        new THREE.Vector3(0.13, 0.1, 0.19),
        accent,
      );
  });
  const head = positions[joints.findIndex((j) => j.name === 'head')];
  shape(
    'head',
    head,
    new THREE.Vector3(0.25, 0.27, canine ? 0.35 : 0.22),
    bodyColor,
  );
  shape(
    'jaw',
    head.clone().add(new THREE.Vector3(0, -0.14, 0.22)),
    new THREE.Vector3(0.16, 0.1, canine ? 0.25 : 0.11),
    accent,
  );
  for (const side of [-1, 1]) {
    shape(
      'head',
      head
        .clone()
        .add(new THREE.Vector3(side * 0.15, 0.04, canine ? 0.28 : 0.18)),
      new THREE.Vector3(0.045, 0.045, 0.045),
      new THREE.Color('#ffdf71'),
    );
    if (canine)
      shape(
        'head',
        head.clone().add(new THREE.Vector3(side * 0.17, 0.27, -0.05)),
        new THREE.Vector3(0.1, 0.2, 0.07),
        accent,
      );
  }
  const geometry = mergeGeometries(geometries)!;
  geometries.forEach((g) => g.dispose());
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'body';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  const times = Array.from({ length: 25 }, (_, i) => i / 12);
  const rotationTrack = (name: string, amplitude: number, offset: number) =>
    new THREE.QuaternionKeyframeTrack(
      `${name}.quaternion`,
      times,
      times.flatMap((t) =>
        new THREE.Quaternion()
          .setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            Math.sin(t * Math.PI * 2 + offset) * amplitude,
          )
          .toArray(),
      ),
    );
  const walk = new THREE.AnimationClip(
    'walk',
    2,
    (canine
      ? ['front_L', 'front_R', 'rear_L', 'rear_R']
      : ['leg_L', 'leg_R', 'arm_L', 'arm_R']
    ).map((name, i) =>
      rotationTrack(name, 0.35, i === 0 || i === 3 ? 0 : Math.PI),
    ),
  );
  const idle = new THREE.AnimationClip('idle', 2, [
    rotationTrack('neck', 0.035, 0),
  ]);
  const clips = [idle, walk],
    mixer = new THREE.AnimationMixer(group);
  let active = '';
  const setAnimation = (name: 'rest' | 'idle' | 'walk') => {
    if (name === active) return;
    mixer.stopAllAction();
    skeleton.pose();
    active = name;
    if (name !== 'rest')
      mixer
        .clipAction(name === 'walk' ? walk : idle)
        .reset()
        .play();
  };
  setAnimation('idle');
  const scale = creature.stats.radius / 0.55;
  group.scale.setScalar(scale);
  return {
    group,
    mesh,
    skeleton,
    clips,
    joints,
    setAnimation,
    update: (dt: number) => mixer.update(Math.min(dt, 0.1)),
    dispose: () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(group);
      geometry.dispose();
      material.dispose();
      skeleton.dispose();
    },
  };
}
