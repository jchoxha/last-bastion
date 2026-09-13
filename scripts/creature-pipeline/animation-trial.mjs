import { appendCanineTrial } from './retarget-canine.mjs';
import { packGlb, unpackGlb } from './animation-gltf.mjs';
import { RigCompatibilityError } from './rig-profiles.mjs';
import { validateRiggedGlb } from './validate.mjs';

// Unsupported rigs keep their provider clip and a visible machine-readable reason.
// Unexpected errors/invalid output still fail the job before installation.
export async function prepareAnimationTrial(bytes, bodyPlan, calibration = {}) {
  if (bodyPlan !== 'canine-v1')
    return {
      bytes,
      report: {
        status: 'skipped',
        reason: 'No animation profile for this body plan.',
      },
    };
  let result;
  try {
    result = await appendCanineTrial(bytes, calibration);
  } catch (error) {
    if (!(error instanceof RigCompatibilityError)) throw error;
    return { bytes, report: { status: 'skipped', reason: error.message } };
  }
  const { doc, bin } = unpackGlb(result.bytes);
  doc.animations = [doc.animations.at(-1)];
  await validateRiggedGlb(packGlb(doc, bin), bodyPlan);
  await validateRiggedGlb(result.bytes, bodyPlan);
  return { ...result, report: { ...result.report, status: 'preview-only' } };
}
