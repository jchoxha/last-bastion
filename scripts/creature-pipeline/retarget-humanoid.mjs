import * as THREE from 'three';
import { appendClip, hierarchy, unpackGlb } from './animation-gltf.mjs';
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

function requireJoint(doc, nodes, name) {
  const matches = doc.nodes.flatMap((node, index) =>
    node.name === name ? [index] : [],
  );
  if (matches.length !== 1 || !nodes.has(matches[0]))
    throw new RigCompatibilityError(`Missing or ambiguous skinned role: ${name}.`);
  return matches[0];
}

function chain(doc, names) {
  const ids = names.map((name) => doc.nodes.findIndex((node) => node.name === name));
  for (let i = 1; i < ids.length; i++)
    if (!doc.nodes[ids[i - 1]].children?.includes(ids[i]))
      throw new RigCompatibilityError(`Unexpected parent for ${names[i]}.`);
  return ids;
}

function swing(rest, degrees) {
  return rest
    .clone()
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), degrees * Math.PI / 180));
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
  const times = Array.from({ length: samples }, (_, index) =>
    (index * duration) / (samples - 1),
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
    const phase = (sample) => Math.sin((sample / (samples - 1)) * Math.PI * 2) * sign;
    // Hip/shoulder rotation carries the gait. Lower joints bend only during
    // the recovery half, avoiding the rigid marching seen in the provider clip.
    track(`tripo::1_${side}_Limb_1`, (sample) => 17 * phase(sample));
    track(`tripo::1_${side}_Limb_2`, (sample) => -20 * Math.max(0, phase(sample)));
    track(`tripo::1_${side}_Limb_3`, (sample) => 8 * Math.max(0, -phase(sample)));
    track(`tripo::0_${side}_Limb_1`, (sample) => -11 * phase(sample));
    track(`tripo::0_${side}_Limb_2`, (sample) => -4 * Math.max(0, -phase(sample)));
  }
  track('tripo::Spine_0', (sample) => 2.2 * Math.sin((sample / (samples - 1)) * Math.PI * 4));
  track('tripo::Spine_1', (sample) => -1.6 * Math.sin((sample / (samples - 1)) * Math.PI * 4));
  const tail = doc.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => /^tripo::Tail_\d+$/.test(node.name))
    .sort((a, b) => Number(a.node.name.split('_').at(-1)) - Number(b.node.name.split('_').at(-1)));
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
              ((tailIndex + 1) * 0.45 + 2.2 * Math.sin((sample / (samples - 1)) * Math.PI * 2 - tailIndex * 0.25)) * Math.PI / 180,
            ),
          )
          .toArray(),
      ),
    );
  });
  doc.animations = [];
  const rootPosition = nodes[root].position.toArray();
  const positions = times.flatMap(() => rootPosition);
  const bytes = compactGlb(appendClip(doc, bin, times, rotations, root, positions, 'walk'));
  return {
    bytes,
    report: {
      status: 'animation-set',
      profile: 'tripo-humanoid-procedural',
      revision: 1,
      walkClip: 0,
      clips: [{ name: 'walk', loop: true, source: 'rest-pose procedural gait' }],
      visualReview: 'required',
    },
  };
}
