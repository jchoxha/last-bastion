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

// Animation-only canine donor. The target side remains provider-independent;
// these names exist only in the donor adapter. Tail blends spread three
// authored joints across five targets.
export const CANINE_ACTION_DONOR = {
  id: 'canine-action-donor-v1',
  roles: {
    root: 'bip001-pelvis',
    pelvis: 'bip001-pelvis',
    spine: 'bip001-spine',
    chest: 'bip001-spine2',
    shoulders: 'bip001-neck',
    neck: 'bip001-neck1',
    upperNeck: 'bip001-head',
    head: 'bip001-head',
  },
  tail: [
    'bip001-tail',
    { names: ['bip001-tail', 'bip001-tail1'], alpha: 0.5 },
    'bip001-tail1',
    { names: ['bip001-tail1', 'bip001-tail2'], alpha: 0.5 },
    'bip001-tail2',
  ],
};
for (const [side, suffix] of [
  ['Left', 'l'],
  ['Right', 'r'],
]) {
  for (const [end, { names }] of Object.entries({
    front: {
      names: ['upperarm', 'forearm', 'hand', 'finger0'],
    },
    rear: {
      names: ['thigh', 'calf', 'horselink', 'foot'],
    },
  }))
    for (let i = 0; i < 4; i++)
      CANINE_ACTION_DONOR.roles[`${end}${side}${i}`] =
        `bip001-${suffix}-${names[i]}`;
}

function donorPair(source, spec, role) {
  const blend = typeof spec === 'object' ? spec : { names: [spec], alpha: 0 };
  const names = blend.names || [];
  const from = source.byName.get(names[0]);
  const fromB = names[1] ? source.byName.get(names[1]) : undefined;
  if (!from || (names[1] && !fromB))
    throw new RigCompatibilityError(`Donor missing role: ${role}.`);
  return {
    from,
    si: source.nodes.indexOf(from),
    ...(fromB
      ? { fromB, siB: source.nodes.indexOf(fromB), alpha: blend.alpha }
      : {}),
  };
}

export function resolveCanineProfile(targetDoc, target, source, donorProfile) {
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
        donorSpec = donorProfile?.roles?.[role] || donor;
      return {
        role,
        to,
        ti: matches[0],
        ...donorPair(source, donorSpec, role),
      };
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
      const spec = donorProfile
        ? donorProfile.hipHelpers?.[side]
        : `BackShoulder.${suffix}`;
      if (spec) {
        const to = candidates[0];
        pairs.push({
          role: `hipHelper${side}`,
          to,
          ti: target.nodes.indexOf(to),
          ...donorPair(source, spec, `hipHelper${side}`),
        });
      }
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
        const spec =
          donorProfile?.tail?.[i] ||
          ['Tail1', 'Tail3', 'Tail5', 'Tail7', 'Tail8'][i];
        pairs.push({
          role: `tail${i}`,
          to,
          ti: target.nodes.indexOf(to),
          ...donorPair(source, spec, `tail${i}`),
        });
      });
  }
  return { pairs, roles };
}
