import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { appendClip, hierarchy, unpackGlb, values } from './animation-gltf.mjs';
import {
  CANINE_PROFILE,
  resolveCanineProfile,
  RigCompatibilityError,
} from './rig-profiles.mjs';
import {
  applySecondaryMotion,
  CANINE_SECONDARY_MOTION,
} from './secondary-motion.mjs';
import { inferTailYaw } from './pose-calibration.mjs';

export const CANINE_CLIP = 'Quaternius wolf walk — canine profile v3 trial';
const up = new THREE.Vector3(0, 1, 0);
const worldPosition = (n) => n.getWorldPosition(new THREE.Vector3());
const worldRotation = (n) => n.getWorldQuaternion(new THREE.Quaternion());

function landmarks(roles, which) {
  const p = (name) => worldPosition(roles[name][which]);
  const front = p('frontLeft0').add(p('frontRight0')).multiplyScalar(0.5);
  const rear = p('rearLeft0').add(p('rearRight0')).multiplyScalar(0.5);
  const forward = front.clone().sub(rear).setY(0);
  if (forward.length() < 1e-6)
    throw new RigCompatibilityError('Cannot resolve body forward direction.');
  forward.normalize();
  const length = (end, side) =>
    [1, 2, 3].reduce(
      (sum, i) =>
        sum + p(`${end}${side}${i}`).distanceTo(p(`${end}${side}${i - 1}`)),
      0,
    );
  const legs = Object.fromEntries(
    ['front', 'rear'].flatMap((end) =>
      ['Left', 'Right'].map((side) => [`${end}${side}`, length(end, side)]),
    ),
  );
  if (Object.values(legs).some((v) => v < 1e-6))
    throw new RigCompatibilityError('Degenerate leg chain.');
  for (const end of ['front', 'rear'])
    if (Math.abs(legs[`${end}Left`] / legs[`${end}Right`] - 1) > 0.25)
      throw new RigCompatibilityError(
        'Asymmetric legs exceed this profile’s supported proportions.',
      );
  return {
    forward,
    legs,
    length: Object.values(legs).reduce((a, b) => a + b) / 4,
  };
}

// Pure offline conversion: accepts any compatible Tripo canine, not a creature ID/hash.
// The only asset-specific input is optional, explicit visual calibration metadata.
export function retargetCanine(
  sourceDoc,
  targetBytes,
  calibration = {},
  options = {},
) {
  const { sourceClip = 'Walk', clipName = CANINE_CLIP, loop = true } = options;
  const {
    headYawDegrees = 0,
    secondaryMotion = true,
    tailYawDegrees,
  } = calibration;
  if (
    Object.keys(calibration).some(
      (k) =>
        !['headYawDegrees', 'secondaryMotion', 'tailYawDegrees'].includes(k),
    ) ||
    typeof secondaryMotion !== 'boolean' ||
    !Number.isFinite(headYawDegrees) ||
    Math.abs(headYawDegrees) > 60 ||
    (tailYawDegrees !== undefined &&
      (!Number.isFinite(tailYawDegrees) || Math.abs(tailYawDegrees) > 60))
  )
    throw new RigCompatibilityError(
      'Calibration supports headYawDegrees/tailYawDegrees between -60 and 60 and a boolean secondaryMotion.',
    );
  const { doc: targetDoc, bin: targetBin } = unpackGlb(targetBytes);
  if (targetDoc.animations?.some((clip) => clip.name === clipName))
    throw new RigCompatibilityError(
      'This asset already includes the canine trial; recalibrate from its original provider asset.',
    );
  const source = hierarchy(sourceDoc),
    target = hierarchy(targetDoc);
  const { pairs, roles } = resolveCanineProfile(targetDoc, target, source);
  const sourceShape = landmarks(roles, 'from'),
    targetShape = landmarks(roles, 'to');
  const alignment = new THREE.Quaternion().setFromUnitVectors(
    sourceShape.forward,
    targetShape.forward,
  );
  const inverseAlignment = alignment.clone().invert();
  const tailCalibration =
    tailYawDegrees === undefined
      ? inferTailYaw(pairs, target, targetShape.forward)
      : { degrees: tailYawDegrees, status: 'explicit' };
  const tailCorrection = new THREE.Quaternion().setFromAxisAngle(
    up,
    THREE.MathUtils.degToRad(tailCalibration.degrees),
  );
  const scale = targetShape.length / sourceShape.length;
  const sourceBin = Buffer.from(
    sourceDoc.buffers[0].uri.split(',')[1],
    'base64',
  );
  const animation = sourceDoc.animations.find((c) => c.name === sourceClip);
  if (!animation)
    throw new RigCompatibilityError('Source has no Walk animation.');
  const tracks = animation.channels.map((c) => {
    const s = animation.samplers[c.sampler];
    if (s.interpolation && s.interpolation !== 'LINEAR')
      throw new RigCompatibilityError('Expected baked linear donor tracks.');
    const property = {
      rotation: 'quaternion',
      translation: 'position',
      scale: 'scale',
    }[c.target.path];
    if (!property)
      throw new RigCompatibilityError('Unsupported donor animation channel.');
    const Track =
      property === 'quaternion'
        ? THREE.QuaternionKeyframeTrack
        : THREE.VectorKeyframeTrack;
    return new Track(
      `node${c.target.node}.${property}`,
      values(sourceDoc, sourceBin, s.input),
      values(sourceDoc, sourceBin, s.output),
    );
  });
  const clip = new THREE.AnimationClip(sourceClip, -1, tracks);
  if (
    !Number.isFinite(clip.duration) ||
    clip.duration <= 0 ||
    clip.duration > 30
  )
    throw new RigCompatibilityError('Invalid walk duration.');
  const mixer = new THREE.AnimationMixer(source.root),
    action = mixer.clipAction(clip).play();
  if (!loop) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  const frameCount = Math.ceil(clip.duration * 30);
  const times = Array.from(
    { length: frameCount + 1 },
    (_, i) => (i * clip.duration) / frameCount,
  );
  const samples = new Map(pairs.map((p) => [p.ti, []])),
    positions = [];
  const paws = ['frontLeft2', 'frontRight2', 'rearLeft3', 'rearRight3'];
  const footRoles = new Set([...paws, 'frontLeft3', 'frontRight3']);
  // Each donor foot's lowest sampled control position is its stance reference.
  // Use motion relative to that orientation, not its unrelated exported rest pose.
  const stance = new Map();
  for (const time of times) {
    action.time = time;
    mixer.update(0);
    source.root.updateMatrixWorld(true);
    for (const role of footRoles) {
      const p = roles[role],
        y = worldPosition(p.from).y;
      if (!stance.has(role) || y < stance.get(role).y)
        stance.set(role, { y, quaternion: worldRotation(p.from) });
    }
  }
  const headCorrection = new THREE.Quaternion().setFromAxisAngle(
    up,
    THREE.MathUtils.degToRad(headYawDegrees),
  );
  const pawSamples = Object.fromEntries(paws.map((r) => [r, []]));
  const footAngle = new Map(paws.map((r) => [r, 0]));
  for (const time of times) {
    action.time = time;
    mixer.update(0);
    source.root.updateMatrixWorld(true);
    const desired = new Map(
      pairs.map((p) => {
        const rest = footRoles.has(p.role)
          ? stance.get(p.role).quaternion
          : source.rest[p.si].quaternion;
        const delta = worldRotation(p.from).multiply(rest.clone().invert());
        const q = alignment
          .clone()
          .multiply(delta)
          .multiply(inverseAlignment)
          .multiply(target.rest[p.ti].quaternion);
        if (['neck', 'upperNeck', 'head'].includes(p.role))
          q.premultiply(headCorrection);
        if (/^tail\d+$/.test(p.role)) q.premultiply(tailCorrection);
        return [p.to, q];
      }),
    );
    if (secondaryMotion)
      applySecondaryMotion(
        desired,
        pairs,
        targetShape.forward,
        (2 * Math.PI * time) / clip.duration,
      );
    const root = roles.root;
    const position = worldPosition(root.from)
      .sub(source.rest[root.si].position)
      .applyQuaternion(alignment)
      .multiplyScalar(scale)
      .add(target.rest[root.ti].position);
    root.to.position.copy(root.to.parent.worldToLocal(position));
    target.root.traverse((n) => {
      if (desired.has(n))
        n.quaternion.copy(
          worldRotation(n.parent).invert().multiply(desired.get(n)),
        );
      n.updateMatrixWorld(true);
    });
    for (const p of pairs) samples.get(p.ti).push(...p.to.quaternion.toArray());
    positions.push(...root.to.position.toArray());
    for (const role of paws) {
      const p = roles[role];
      pawSamples[role].push(worldPosition(p.to).toArray());
      const angle = THREE.MathUtils.radToDeg(
        worldRotation(p.to).angleTo(target.rest[p.ti].quaternion),
      );
      footAngle.set(role, Math.max(footAngle.get(role), angle));
    }
  }
  const feet = Object.fromEntries(
    paws.map((role) => {
      const points = pawSamples[role],
        ys = points.map((p) => p[1]);
      const floor = target.rest[roles[role].ti].position.y;
      return [
        role,
        {
          excursion:
            Math.max(
              ...points.map((p) =>
                new THREE.Vector3(...p).dot(targetShape.forward),
              ),
            ) -
            Math.min(
              ...points.map((p) =>
                new THREE.Vector3(...p).dot(targetShape.forward),
              ),
            ),
          maxBelowRestHeight: Math.max(0, floor - Math.min(...ys)),
          maxRotationFromStanceDegrees: footAngle.get(role),
          loopPositionError: new THREE.Vector3(...points[0]).distanceTo(
            new THREE.Vector3(...points.at(-1)),
          ),
        },
      ];
    }),
  );
  const warnings = [
    'Visual review required: paw controls are not mesh contact points; foot locking/IK is not implemented.',
    ...(headYawDegrees === 0
      ? [
          'Head facing is uncalibrated: bone positions cannot establish the mesh’s gaze direction.',
        ]
      : ['Head yaw was explicitly calibrated; inspect neck skin deformation.']),
  ];
  if (['unresolved', 'needs-review'].includes(tailCalibration.status))
    warnings.push(
      'Tail centering needs visual calibration; no yaw correction was inferred.',
    );
  if (
    Object.values(feet).some(
      (f) => f.maxBelowRestHeight > targetShape.length * 0.1,
    )
  )
    warnings.push(
      'Paw control drops more than 10% of leg length below its rest height.',
    );
  for (const rotations of samples.values())
    for (let i = 0; i < rotations.length; i += 4) {
      const q = rotations.slice(i, i + 4);
      if (
        q.some((v) => !Number.isFinite(v)) ||
        Math.abs(Math.hypot(...q) - 1) > 1e-3
      )
        throw Error('Retargeting produced an invalid rotation.');
    }
  if (
    positions.some((v) => !Number.isFinite(v)) ||
    (loop &&
      Object.values(feet).some(
        (f) => f.loopPositionError > targetShape.length * 0.01,
      ))
  )
    throw Error(
      'Retargeting produced an invalid translation or open foot loop.',
    );
  const report = {
    profile: CANINE_PROFILE.id,
    revision: CANINE_PROFILE.revision,
    calibration,
    tailCalibration,
    secondaryMotion: {
      enabled: secondaryMotion,
      ...(secondaryMotion ? CANINE_SECONDARY_MOTION : {}),
      mappedTailJoints: pairs.filter((p) => /^tail\d+$/.test(p.role)).length,
    },
    clip: targetDoc.animations?.length || 0,
    clipName,
    rootMotionScale: scale,
    legLengths: targetShape.legs,
    forward: targetShape.forward.toArray(),
    feet,
    warnings,
    visualReview: 'unverified',
  };
  const bytes = appendClip(
    targetDoc,
    targetBin,
    times,
    samples,
    roles.root.ti,
    positions,
    clipName,
  );
  return { bytes, report };
}

let donor;
export async function appendCanineTrial(bytes, calibration = {}) {
  donor ||= readFile(
    new URL('./animations/quaternius-wolf-walk.gltf', import.meta.url),
  );
  const sourceBytes = await donor;
  if (
    createHash('sha256').update(sourceBytes).digest('hex') !==
    'b30d0d36387f1768c9af27ddcff627efc6104cc3561e2d1c160c72e328c06ffe'
  )
    throw Error(
      'Animation library checksum changed; review and version the donor before using it.',
    );
  const result = retargetCanine(JSON.parse(sourceBytes), bytes, calibration);
  result.report.sourceSha256 = createHash('sha256')
    .update(sourceBytes)
    .digest('hex');
  return result;
}
