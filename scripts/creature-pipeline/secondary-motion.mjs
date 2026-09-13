import * as THREE from 'three';

// Art-directed secondary motion, not donor animation or a physics simulation.
// World-space offsets use the measured body frame. Absolute offsets per joint
// avoid multiplying the full sway angle at every link of the chain.
export const CANINE_SECONDARY_MOTION = Object.freeze({
  headYawDegrees: 5,
  headPitchDegrees: 2,
  tailRootYawDegrees: 9,
  tailTipYawDegrees: 18,
  tailPhaseLagRadians: 1.1,
});

export function applySecondaryMotion(desired, pairs, forward, phase) {
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, forward).normalize();
  const config = CANINE_SECONDARY_MOTION;
  const yaw = new THREE.Quaternion().setFromAxisAngle(
    up,
    THREE.MathUtils.degToRad(config.headYawDegrees) * Math.sin(phase),
  );
  const pitch = new THREE.Quaternion().setFromAxisAngle(
    side,
    THREE.MathUtils.degToRad(config.headPitchDegrees) * Math.sin(2 * phase),
  );
  const head = yaw.multiply(pitch);
  const tail = pairs.filter((p) => /^tail\d+$/.test(p.role));
  for (const pair of pairs) {
    if (['neck', 'upperNeck', 'head'].includes(pair.role))
      desired.get(pair.to).premultiply(head);
  }
  tail.forEach((pair, i) => {
    const along = tail.length > 1 ? i / (tail.length - 1) : 0;
    const amplitude = THREE.MathUtils.lerp(
      config.tailRootYawDegrees,
      config.tailTipYawDegrees,
      along,
    );
    const angle =
      THREE.MathUtils.degToRad(amplitude) *
      Math.sin(phase - along * config.tailPhaseLagRadians);
    desired
      .get(pair.to)
      .premultiply(new THREE.Quaternion().setFromAxisAngle(up, angle));
  });
}
