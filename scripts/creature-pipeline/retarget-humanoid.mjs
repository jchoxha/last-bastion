import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import {
  appendClip,
  hierarchy,
  packGlb,
  unpackGlb,
  values,
} from './animation-gltf.mjs';
import { compactGlb } from './compact-glb.mjs';
import { RigCompatibilityError } from './rig-profiles.mjs';

// Tripo's biped preset writes translation and scale keys across helper bones.
// Build a small, rotation-only locomotion clip from the verified biped naming
// contract instead. This keeps the generated mesh in its bind pose between
// controlled joint rotations and works for digitigrade humanoids as well.
const REQUIRED = [
  'tripo::Root',
  'tripo::Spine_0',
  'tripo::Spine_1',
  ...['Left', 'Right'].flatMap((side) => [
    ...[0, 1, 2].map((i) => `tripo::0_${side}_Limb_${i}`),
    ...[0, 1, 2, 3].map((i) => `tripo::1_${side}_Limb_${i}`),
  ]),
];

const HUMANOID_SOURCES = [
  [
    new URL('../../public/motion-kits/humanoid-ual1.glb', import.meta.url),
    [
      ['idle', 'Idle_Loop'],
      ['walk', 'Walk_Loop'],
      ['run', 'Jog_Fwd_Loop'],
      ['run-alt', 'Walk_Formal_Loop'],
      ['attack', 'Punch_Cross'],
      ['attack-alt', 'Punch_Jab'],
      ['hit', 'Hit_Chest'],
      ['death', 'Death01'],
      ['charge', 'Sprint_Loop'],
      ['leap', 'Roll'],
      ['cast', 'Spell_Simple_Shoot'],
      ['stagger', 'Hit_Head'],
      ['jump', 'Jump_Start'],
      ['land', 'Jump_Land'],
      ['idle-event', 'Idle_Talking_Loop'],
      ['idle-calm', 'Idle_Torch_Loop'],
      ['idle-alert', 'Crouch_Idle_Loop'],
      ['greet', 'Interact'],
      ['talk', 'Idle_Talking_Loop'],
    ],
  ],
  [
    new URL('../../public/motion-kits/humanoid-ual2.glb', import.meta.url),
    [
      ['turn-left', 'Walk_Carry_Loop'],
      ['turn-right', 'Walk_Carry_Loop'],
      ['turn-around', 'Slide_Exit'],
      ['spawn', 'LayToIdle'],
      ['idle-absurd', 'Zombie_Idle_Loop'],
      ['idle-alert-alt', 'Idle_FoldArms_Loop'],
      ['greet-alt', 'Yes'],
    ],
  ],
];

const ROLE_PAIRS = [
  ['pelvis', 'tripo::Spine_0'],
  ['spine_01', 'tripo::Spine_1'],
  ['neck_01', 'tripo::Head_0'],
  ['Head', 'tripo::Head_1'],
  ...['Left', 'Right'].flatMap((side) => {
    const suffix = side === 'Left' ? 'l' : 'r';
    return [
      [`clavicle_${suffix}`, `tripo::0_${side}_Limb_0`],
      [`upperarm_${suffix}`, `tripo::0_${side}_Limb_1`],
      [`lowerarm_${suffix}`, `tripo::0_${side}_Limb_2`],
      [`hand_${suffix}`, `tripo::0_${side}_Limb_3`],
      [`thigh_${suffix}`, `tripo::1_${side}_Limb_0`],
      [`calf_${suffix}`, `tripo::1_${side}_Limb_1`],
      [`foot_${suffix}`, `tripo::1_${side}_Limb_2`],
      [`ball_${suffix}`, `tripo::1_${side}_Limb_3`],
    ];
  }),
];

function requireJoint(doc, nodes, name) {
  const matches = doc.nodes.flatMap((node, index) =>
    node.name === name ? [index] : [],
  );
  if (matches.length !== 1 || !nodes.has(matches[0]))
    throw new RigCompatibilityError(
      `Missing or ambiguous skinned role: ${name}.`,
    );
  return matches[0];
}

function chain(doc, names) {
  const ids = names.map((name) =>
    doc.nodes.findIndex((node) => node.name === name),
  );
  for (let i = 1; i < ids.length; i++)
    if (!doc.nodes[ids[i - 1]].children?.includes(ids[i]))
      throw new RigCompatibilityError(`Unexpected parent for ${names[i]}.`);
  return ids;
}

function swing(rest, degrees) {
  return rest
    .clone()
    .multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        (degrees * Math.PI) / 180,
      ),
    );
}

export function buildHumanoidWalk(input) {
  const parsed = unpackGlb(input);
  const { doc, bin } = parsed;
  const joints = new Set(doc.skins?.flatMap((skin) => skin.joints) || []);
  REQUIRED.forEach((name) => requireJoint(doc, joints, name));
  const { nodes } = hierarchy(doc);
  for (const side of ['Left', 'Right']) {
    chain(doc, [
      `tripo::0_${side}_Limb_0`,
      `tripo::0_${side}_Limb_1`,
      `tripo::0_${side}_Limb_2`,
    ]);
    chain(doc, [
      'tripo::Spine_0',
      `tripo::1_${side}_Limb_0`,
      `tripo::1_${side}_Limb_1`,
      `tripo::1_${side}_Limb_2`,
      `tripo::1_${side}_Limb_3`,
    ]);
  }
  const root = requireJoint(doc, joints, 'tripo::Root');
  const rotations = new Map();
  const samples = 31;
  const duration = 1.05;
  const times = Array.from(
    { length: samples },
    (_, index) => (index * duration) / (samples - 1),
  );
  const track = (name, degreesAt) => {
    const index = doc.nodes.findIndex((node) => node.name === name);
    const rest = nodes[index].quaternion;
    rotations.set(
      index,
      times.flatMap((_, sample) => swing(rest, degreesAt(sample)).toArray()),
    );
  };
  for (const [side, sign] of [
    ['Left', 1],
    ['Right', -1],
  ]) {
    const phase = (sample) =>
      Math.sin((sample / (samples - 1)) * Math.PI * 2) * sign;
    // Hip/shoulder rotation carries the gait. Lower joints bend only during
    // the recovery half, avoiding the rigid marching seen in the provider clip.
    track(`tripo::1_${side}_Limb_1`, (sample) => 17 * phase(sample));
    track(
      `tripo::1_${side}_Limb_2`,
      (sample) => -20 * Math.max(0, phase(sample)),
    );
    track(
      `tripo::1_${side}_Limb_3`,
      (sample) => 8 * Math.max(0, -phase(sample)),
    );
    track(`tripo::0_${side}_Limb_1`, (sample) => -11 * phase(sample));
    track(
      `tripo::0_${side}_Limb_2`,
      (sample) => -4 * Math.max(0, -phase(sample)),
    );
  }
  track(
    'tripo::Spine_0',
    (sample) => 2.2 * Math.sin((sample / (samples - 1)) * Math.PI * 4),
  );
  track(
    'tripo::Spine_1',
    (sample) => -1.6 * Math.sin((sample / (samples - 1)) * Math.PI * 4),
  );
  const tail = doc.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => /^tripo::Tail_\d+$/.test(node.name))
    .sort(
      (a, b) =>
        Number(a.node.name.split('_').at(-1)) -
        Number(b.node.name.split('_').at(-1)),
    );
  tail.forEach(({ index }, tailIndex) => {
    const rest = nodes[index].quaternion;
    rotations.set(
      index,
      times.flatMap((_, sample) =>
        rest
          .clone()
          .multiply(
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 0, 1),
              (((tailIndex + 1) * 0.45 +
                2.2 *
                  Math.sin(
                    (sample / (samples - 1)) * Math.PI * 2 - tailIndex * 0.25,
                  )) *
                Math.PI) /
                180,
            ),
          )
          .toArray(),
      ),
    );
  });
  doc.animations = [];
  const rootPosition = nodes[root].position.toArray();
  const positions = times.flatMap(() => rootPosition);
  const bytes = compactGlb(
    appendClip(doc, bin, times, rotations, root, positions, 'walk'),
  );
  return {
    bytes,
    report: {
      status: 'animation-set',
      profile: 'tripo-humanoid-procedural',
      revision: 1,
      walkClip: 0,
      clips: [
        { name: 'walk', loop: true, source: 'rest-pose procedural gait' },
      ],
      visualReview: 'required',
    },
  };
}

function sampleRotation(doc, bin, animation, sourceNode, time) {
  const channel = animation.channels.find(
    (candidate) =>
      candidate.target.node === sourceNode &&
      candidate.target.path === 'rotation',
  );
  if (!channel) return undefined;
  const sampler = animation.samplers[channel.sampler];
  if (sampler.interpolation === 'CUBICSPLINE')
    throw new RigCompatibilityError(
      'Humanoid donor uses unsupported spline rotation.',
    );
  const times = values(doc, bin, sampler.input);
  const output = values(doc, bin, sampler.output);
  let right = times.findIndex((value) => value >= time);
  if (right < 0) right = times.length - 1;
  const left = Math.max(0, right - 1);
  if (left === right || times[right] === times[left])
    return new THREE.Quaternion().fromArray(output, right * 4).normalize();
  const alpha = (time - times[left]) / (times[right] - times[left]);
  return new THREE.Quaternion()
    .fromArray(output, left * 4)
    .normalize()
    .slerp(
      new THREE.Quaternion().fromArray(output, right * 4).normalize(),
      alpha,
    )
    .normalize();
}

function retargetClip(target, source, animation, name) {
  const sourceJoints = new Set(
    source.doc.skins?.flatMap((skin) => skin.joints) || [],
  );
  const targetJoints = new Set(
    target.doc.skins?.flatMap((skin) => skin.joints) || [],
  );
  const pairs = ROLE_PAIRS.flatMap(([fromName, toName]) => {
    const from = source.doc.nodes.findIndex((node) => node.name === fromName);
    const to = target.doc.nodes.findIndex((node) => node.name === toName);
    return from >= 0 &&
      to >= 0 &&
      sourceJoints.has(from) &&
      targetJoints.has(to)
      ? [{ from, to }]
      : [];
  });
  if (pairs.length < 12)
    throw new RigCompatibilityError(
      'Humanoid donor and target share too few anatomical roles.',
    );
  const duration = Math.max(
    ...animation.samplers.map((sampler) => {
      const times = values(source.doc, source.bin, sampler.input);
      return times.at(-1) || 0;
    }),
  );
  const samples = Math.max(2, Math.min(91, Math.ceil(duration * 30) + 1));
  const times = Array.from(
    { length: samples },
    (_, index) => (index * duration) / (samples - 1),
  );
  const targetHierarchy = hierarchy(target.doc);
  const rotations = new Map();
  for (const { from, to } of pairs) {
    const sourceRest = new THREE.Quaternion().fromArray(
      source.doc.nodes[from].rotation || [0, 0, 0, 1],
    );
    const targetRest = targetHierarchy.nodes[to].quaternion;
    const output = times.flatMap((time) => {
      const pose = sampleRotation(
        source.doc,
        source.bin,
        animation,
        from,
        time,
      );
      if (!pose) return targetRest.toArray();
      const delta = pose.multiply(sourceRest.clone().invert()).normalize();
      return targetRest.clone().multiply(delta).normalize().toArray();
    });
    rotations.set(to, output);
  }
  const root = requireJoint(target.doc, targetJoints, 'tripo::Root');
  const rootPosition = targetHierarchy.nodes[root].position.toArray();
  return appendClip(
    target.doc,
    target.bin,
    times,
    rotations,
    root,
    times.flatMap(() => rootPosition),
    name,
  );
}

// Retarget sampled rotations only. Keeping Cinder-style bind translations and
// scale prevents the distorted limbs produced by directly applying a human GLB.
export async function buildHumanoidAnimationSet(input) {
  let bytes = input;
  const first = unpackGlb(bytes);
  first.doc.animations = [];
  bytes = compactGlb(packGlb(first.doc, first.bin));
  const clips = [];
  for (const [file, selections] of HUMANOID_SOURCES) {
    const source = unpackGlb(await readFile(file));
    for (const [name, sourceName] of selections) {
      const animation = source.doc.animations.find(
        (clip) => clip.name === sourceName,
      );
      if (!animation)
        throw new RigCompatibilityError(
          `Humanoid donor is missing ${sourceName}.`,
        );
      const target = unpackGlb(bytes);
      bytes = retargetClip(target, source, animation, name);
      clips.push({ name, source: sourceName });
    }
  }
  return {
    bytes,
    report: {
      status: 'animation-set',
      profile: 'tripo-humanoid-role-retarget',
      revision: 2,
      walkClip: clips.findIndex((clip) => clip.name === 'walk'),
      clips,
      visualReview: 'required',
    },
  };
}
