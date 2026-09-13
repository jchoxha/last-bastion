import * as THREE from 'three';

// Center the tail's horizontal base-to-tip direction on the body's rear axis.
// Preserve its curl and elevation; short/vertical tails provide no reliable yaw.
export function inferTailYaw(pairs, target, forward) {
  const tail = pairs.filter((p) => /^tail\d+$/.test(p.role));
  if (tail.length < 2) return { degrees: 0, status: 'unresolved' };
  const positions = tail.map((p) => target.rest[p.ti].position);
  const length = positions
    .slice(1)
    .reduce((sum, p, i) => sum + p.distanceTo(positions[i]), 0);
  const direction = positions.at(-1).clone().sub(positions[0]).setY(0);
  if (direction.length() < length * 0.2 || length < 1e-6)
    return { degrees: 0, status: 'unresolved' };
  direction.normalize();
  const rear = forward.clone().negate();
  const degrees = THREE.MathUtils.radToDeg(
    Math.atan2(
      new THREE.Vector3().crossVectors(direction, rear).y,
      direction.dot(rear),
    ),
  );
  if (Math.abs(degrees) > 60) return { degrees: 0, status: 'needs-review' };
  return { degrees, status: 'inferred-from-tail-axis' };
}
