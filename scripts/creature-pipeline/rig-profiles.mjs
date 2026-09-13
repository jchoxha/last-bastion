import * as THREE from 'three';

export class RigCompatibilityError extends Error {}

// Semantic roles describe anatomy; provider bone names stay in this adapter.
// Revision changes whenever mapping or calibration semantics change.
export const CANINE_PROFILE = {
  id: 'tripo-canine',
  revision: 3,
  bodyPlan: 'canine-v1',
  roles: {
    root: ['tripo::Root', 'Body'],
    pelvis: ['tripo::Spine_0', 'Back'],
    spine: ['tripo::Spine_1', 'Torso'],
    chest: ['tripo::Spine_2', 'Torso2'],
    shoulders: ['tripo::Spine_3', 'Torso3'],
    neck: ['tripo::Head_0', 'Neck1'],
    upperNeck: ['tripo::Head_1', 'Neck3'],
    head: ['tripo::Head_2', 'Head'],
  },
};
for (const [side, suffix] of [
  ['Left', 'L'],
  ['Right', 'R'],
]) {
  for (const [end, { prefix, donor }] of Object.entries({
    front: {
      prefix: '0',
      donor: ['FrontUpperLeg', 'FrontLowerLeg', 'IKFrontLeg', 'FF'],
    },
    rear: {
      prefix: '1',
      donor: ['BackLeg', 'BackUpperLeg', 'BackLowerLeg', 'IKBackLeg'],
    },
  })) {
    for (let i = 0; i < 4; i++)
      CANINE_PROFILE.roles[`${end}${side}${i}`] = [
        `tripo::${prefix}_${side}_Limb_${i}`,
        `${donor[i]}.${suffix}`,
      ];
  }
}

export function resolveCanineProfile(targetDoc, target, source) {
  const joints = new Set(targetDoc.skins?.flatMap((s) => s.joints) || []);
  const pairs = Object.entries(CANINE_PROFILE.roles).map(
    ([role, [name, donor]]) => {
      const matches = targetDoc.nodes.flatMap((n, i) =>
        n.name === name ? [i] : [],
      );
      if (matches.length !== 1 || !joints.has(matches[0]))
        throw new RigCompatibilityError(
          `Missing or ambiguous skinned role: ${role} (${name}).`,
        );
      const to = target.nodes[matches[0]],
        from = source.byName.get(donor);
      if (!from)
        throw new RigCompatibilityError(`Donor missing role: ${role}.`);
      return { role, to, from, ti: matches[0], si: source.nodes.indexOf(from) };
    },
  );
  const roles = Object.fromEntries(pairs.map((p) => [p.role, p]));
  const chain = (names) => {
    for (let i = 1; i < names.length; i++)
      if (roles[names[i]].to.parent !== roles[names[i - 1]].to)
        throw new RigCompatibilityError(`Unexpected parent for ${names[i]}.`);
  };
  chain([
    'root',
    'pelvis',
    'spine',
    'chest',
    'shoulders',
    'neck',
    'upperNeck',
    'head',
  ]);
  for (const side of ['Left', 'Right'])
    for (const end of ['front', 'rear'])
      chain([
        end === 'front' ? 'chest' : 'root',
        ...[0, 1, 2, 3].map((i) => `${end}${side}${i}`),
      ]);
  // Optional helper bones are found by geometry/ancestry, never generated numeric names.
  for (const [side, suffix] of [
    ['Left', 'L'],
    ['Right', 'R'],
  ]) {
    const hip = roles[`rear${side}0`];
    const candidates = roles.root.to.children.filter(
      (n) =>
        !n.children.length &&
        n !== hip.to &&
        n
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(target.rest[hip.ti].position) < 1e-6,
    );
    if (candidates.length === 1) {
      const to = candidates[0],
        from = source.byName.get(`BackShoulder.${suffix}`);
      pairs.push({
        role: `hipHelper${side}`,
        to,
        from,
        ti: target.nodes.indexOf(to),
        si: source.nodes.indexOf(from),
      });
    }
  }
  const tail = target.byName.get('tripo::Tail_1');
  if (tail) {
    const chain = [];
    let n = tail;
    while (n && n !== roles.root.to) {
      chain.unshift(n);
      n = n.parent;
    }
    if (n === roles.root.to && chain.length === 5)
      chain.forEach((to, i) => {
        const from = source.byName.get(
          ['Tail1', 'Tail3', 'Tail5', 'Tail7', 'Tail8'][i],
        );
        pairs.push({
          role: `tail${i}`,
          to,
          from,
          ti: target.nodes.indexOf(to),
          si: source.nodes.indexOf(from),
        });
      });
  }
  return { pairs, roles };
}
