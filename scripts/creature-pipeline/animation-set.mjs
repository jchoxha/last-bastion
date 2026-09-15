import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { CREATURE_MOTIONS } from '../../lib/creatures/motions.ts';
import { retargetCanine } from './retarget-canine.mjs';
import { buildHumanoidWalk } from './retarget-humanoid.mjs';
import { unpackGlb, packGlb, appendClip, values } from './animation-gltf.mjs';
import { compactGlb } from './compact-glb.mjs';
import { validateRiggedGlb } from './validate.mjs';
import { CANINE_ACTION_DONOR, RigCompatibilityError } from './rig-profiles.mjs';

function procedural(bytes, name) {
  const { doc, bin } = unpackGlb(bytes);
  const idle = doc.animations.find((a) => a.name === 'idle');
  const walk = doc.animations.find((a) => a.name === 'walk');
  const root = doc.nodes.findIndex((n) => n.name === 'tripo::Root');
  const base = new Map(
    idle.channels.map((c) => [
      c.target.node,
      values(doc, bin, idle.samplers[c.sampler].output).slice(
        0,
        c.target.path === 'rotation' ? 4 : 3,
      ),
    ]),
  );
  const rotating = idle.channels
    .filter((c) => c.target.path === 'rotation')
    .map((c) => c.target.node);
  const rootPosition = base.get(root);
  // Root has both rotation and translation channels; read the rotation explicitly.
  const rotations = new Map(
    rotating.map((i) => {
      const c = idle.channels.find(
        (c) => c.target.node === i && c.target.path === 'rotation',
      );
      return [i, values(doc, bin, idle.samplers[c.sampler].output).slice(0, 4)];
    }),
  );
  const turn = name.startsWith('turn-');
  const duration = turn
    ? name === 'turn-around'
      ? 1.8
      : 1.2
    : name === 'spawn'
      ? 1.3
      : 1.4;
  const count = Math.ceil(duration * 30),
    times = Array.from({ length: count + 1 }, (_, i) => (i * duration) / count);
  const samples = new Map(rotating.map((i) => [i, []])),
    positions = [];
  const size =
    Math.abs(
      doc.nodes.find((n) => n.name === 'tripo::0_Left_Limb_1').translation[1],
    ) * 2;
  const axis = new THREE.Vector3(0, 0, 1);
  for (const t of times) {
    const progress = t / duration,
      phase = progress * Math.PI * 2;
    for (const i of rotating) {
      const q = new THREE.Quaternion().fromArray(rotations.get(i)),
        bone = doc.nodes[i].name;
      if (turn && /Limb_[012]$/.test(bone)) {
        const c = walk.channels.find(
          (c) => c.target.node === i && c.target.path === 'rotation',
        );
        if (c) {
          const data = values(doc, bin, walk.samplers[c.sampler].output);
          const frames = data.length / 4;
          const frame = Math.min(
            frames - 1,
            Math.round(progress * (frames - 1)),
          );
          q.slerp(new THREE.Quaternion().fromArray(data, frame * 4), 0.35);
        }
      }
      const bend =
        name === 'spawn'
          ? Math.pow(1 - progress, 2) * 0.45
          : name === 'cast'
            ? Math.pow(Math.sin(Math.PI * progress), 2) * 0.25
            : 0;
      if (bone.endsWith('Limb_0'))
        q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, bend));
      if (bone.endsWith('Limb_1'))
        q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, -bend * 1.7));
      if (bone === 'tripo::Head_0')
        q.multiply(
          new THREE.Quaternion().setFromAxisAngle(
            axis,
            name === 'cast' ? -bend : turn ? 0.06 * Math.sin(phase) : 0,
          ),
        );
      samples.get(i).push(...q.toArray());
    }
    positions.push(
      rootPosition[0],
      rootPosition[1] -
        (name === 'spawn'
          ? size * 0.4 * Math.pow(1 - progress, 2)
          : name === 'cast'
            ? size * 0.05 * Math.sin(Math.PI * progress)
            : 0),
      rootPosition[2],
    );
  }
  return appendClip(doc, bin, times, samples, root, positions, name);
}

export async function buildAnimationSet(input, bodyPlan, calibration = {}) {
  if (bodyPlan === 'humanoid-v1') {
    try {
      const result = buildHumanoidWalk(input);
      await validateRiggedGlb(result.bytes, bodyPlan);
      return result;
    } catch (error) {
      // A provider can label a result as a biped while omitting a connected
      // leg or arm chain. Keep that model out of the game and preserve the
      // exact structural reason for the retained-job review.
      if (error instanceof RigCompatibilityError)
        return {
          bytes: input,
          report: {
            status: 'skipped',
            reason: error.message,
          },
        };
      throw error;
    }
  }
  if (bodyPlan !== 'canine-v1')
    return {
      bytes: input,
      report: {
        status: 'skipped',
        reason: 'No animation set for this body plan.',
      },
    };
  try {
    let bytes;
    const diagnostics = {};
    let parsed = unpackGlb(input);
    parsed.doc.animations = [];
    bytes = compactGlb(packGlb(parsed.doc, parsed.bin));
    const primaryBytes = await readFile(
      new URL('./animations/canine-action-donor.glb', import.meta.url),
    );
    const primarySha256 = createHash('sha256')
      .update(primaryBytes)
      .digest('hex');
    if (
      primarySha256 !==
      '37bb55237896c6cad81c47b718729df28062153f4364c65484eacdaf73f705d9'
    )
      throw Error(
        'Primary canine animation source checksum changed; review and version the donor before use.',
      );
    const primarySources = {
      idle: 'idle_normal_1.001',
      walk: 'evt2_walk_normal_1',
      run: 'run_normal_1',
      'run-alt': 'evt2_run_01',
      attack: 'att_battle_1_01',
      'attack-alt': 'att_battle_2_01',
      charge: 'evt2_run_battle_1',
      leap: 'sk_moving',
      cast: 'sk_howling',
      spawn: 'on',
      'idle-event': 'evt2_idle_normal_1',
      'idle-absurd': 'evt2_sc_absurd_loop_1',
      'idle-calm': 'idle_normal_1',
      'idle-alert': 'idle_normal_1_1',
      'idle-alert-alt': 'idle_normal_1_1.001',
      greet: 'sc_greet_1',
      'greet-alt': 'sc_greet_2',
      talk: 'sc_talk_1',
    };
    const provenance = {};
    for (const [name, sourceClip] of Object.entries(primarySources)) {
      const result = retargetCanine(
        primaryBytes,
        bytes,
        { ...calibration, secondaryMotion: false },
        {
          sourceClip,
          clipName: name,
          loop: CREATURE_MOTIONS[name].loop,
          donorProfile: CANINE_ACTION_DONOR,
        },
      );
      bytes = result.bytes;
      diagnostics[name] = result.report;
      provenance[name] = {
        source: sourceClip,
        sourcePack: CANINE_ACTION_DONOR.id,
        loop: CREATURE_MOTIONS[name].loop,
      };
    }
    const fallbackBytes = await readFile(
      new URL('./animations/quaternius-wolf-actions.gltf', import.meta.url),
    );
    if (
      createHash('sha256').update(fallbackBytes).digest('hex') !==
      '90001d38562205c58cea21cf355a540ad2c595c5c1997be20497a42f87c7289f'
    )
      throw Error(
        'Animation source checksum changed; review the library before use.',
      );
    const fallback = JSON.parse(fallbackBytes);
    const fallbackSources = {
      hit: 'Idle_HitReact1',
      death: 'Death',
      stagger: 'Idle_HitReact2',
      jump: 'Gallop_Jump',
      land: 'Jump_ToIdle',
    };
    for (const [name, sourceClip] of Object.entries(fallbackSources)) {
      const loop = CREATURE_MOTIONS[name].loop;
      const result = retargetCanine(
        fallback,
        bytes,
        { ...calibration, secondaryMotion: false },
        { sourceClip, clipName: name, loop: false },
      );
      bytes = result.bytes;
      diagnostics[name] = result.report;
      // Looping sources have authored end poses. Record loop policy independently of the retarget gate.
      provenance[name] = { source: sourceClip, loop };
    }
    for (const name of ['turn-left', 'turn-right', 'turn-around']) {
      bytes = procedural(bytes, name);
      provenance[name] = { source: 'procedural canine pose/step sequence' };
    }
    parsed = unpackGlb(bytes);
    parsed.doc.animations.sort(
      (a, b) =>
        Object.keys(CREATURE_MOTIONS).indexOf(a.name) -
        Object.keys(CREATURE_MOTIONS).indexOf(b.name),
    );
    for (const clip of parsed.doc.animations) {
      clip.extras = {
        ...CREATURE_MOTIONS[clip.name],
        ...provenance[clip.name],
        ...(clip.name === 'attack' ? { impactFraction: 0.4 } : {}),
        visualReview: 'unverified',
      };
    }
    bytes = compactGlb(packGlb(parsed.doc, parsed.bin));
    await validateRiggedGlb(bytes, bodyPlan);
    const final = unpackGlb(bytes);
    for (const clip of final.doc.animations) {
      const isolated = structuredClone(final.doc);
      isolated.animations = [clip];
      await validateRiggedGlb(packGlb(isolated, final.bin), bodyPlan, {
        isolatedAnimation: true,
      });
    }
    return {
      bytes,
      report: {
        status: 'animation-set',
        version: 2,
        profile: diagnostics.idle.profile,
        revision: diagnostics.idle.revision,
        calibration,
        tailCalibration: diagnostics.idle.tailCalibration,
        diagnostics,
        walkClip: final.doc.animations.findIndex(
          (clip) => clip.name === 'walk',
        ),
        clips: final.doc.animations.map((c) => ({ name: c.name, ...c.extras })),
        sourceSha256: {
          primary: primarySha256,
          fallback: createHash('sha256').update(fallbackBytes).digest('hex'),
        },
        visualReview: 'unverified',
        warnings: [
          ...new Set(Object.values(diagnostics).flatMap((r) => r.warnings)),
          'Procedural pivots need contact review; special clips do not grant combat abilities.',
        ],
      },
    };
  } catch (error) {
    if (error instanceof RigCompatibilityError)
      return {
        bytes: input,
        report: { status: 'skipped', reason: error.message },
      };
    throw error;
  }
}
