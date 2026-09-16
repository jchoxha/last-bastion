import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { unpackGlb, packGlb } from '../scripts/creature-pipeline/animation-gltf.mjs';
import {
  validateDeformationGates,
  validateHumanoidHierarchy,
  validateWeightingGate,
  validateMotionSampling,
  DeformationGateError,
} from '../scripts/creature-pipeline/deformation-gate.mjs';

const ironhideGlbPath = 'public/creatures/asset_2cb2b3400dfde3a118be89b6.glb';

test('valid rebound Ironhide passes all deformation and hierarchy gates', async () => {
  const bytes = await readFile(ironhideGlbPath);
  const result = validateDeformationGates(bytes);
  assert.equal(result.status, 'passed');
  assert.equal(result.bodyPlan, 'humanoid-v1');
  assert.equal(result.maxInfluences, 4);
  assert.ok(result.vertices > 10000);
  assert.ok(result.legChannelsAnimated >= 4);
});

test('hierarchy gate rejects missing canonical joints or broken parent chains', async () => {
  const bytes = await readFile(ironhideGlbPath);
  const { doc } = unpackGlb(bytes);

  // 1. Missing joint
  const docMissing = structuredClone(doc);
  const headNode = docMissing.nodes.find((n) => n.name === 'Head');
  headNode.name = 'Head_Renamed';
  assert.throws(
    () => validateHumanoidHierarchy(docMissing),
    /Missing required canonical joint: Head/,
  );

  // 2. Broken parent-child chain
  const docBrokenChain = structuredClone(doc);
  const neckIdx = docBrokenChain.nodes.findIndex((n) => n.name === 'neck_01');
  const headIdx = docBrokenChain.nodes.findIndex((n) => n.name === 'Head');
  docBrokenChain.nodes[neckIdx].children = docBrokenChain.nodes[neckIdx].children.filter(
    (c) => c !== headIdx,
  );
  assert.throws(
    () => validateHumanoidHierarchy(docBrokenChain),
    /Broken hierarchy chain/,
  );
});

test('weighting gate rejects non-normalized weights, unweighted vertices, and starved limbs', async () => {
  const bytes = await readFile(ironhideGlbPath);
  const { doc, bin } = unpackGlb(bytes);

  // 1. Unweighted vertex
  const binUnweighted = Buffer.from(bin);
  const weightsAcc = doc.accessors[doc.meshes[0].primitives[0].attributes.WEIGHTS_0];
  const weightView = doc.bufferViews[weightsAcc.bufferView];
  const offset = (weightView.byteOffset || 0) + (weightsAcc.byteOffset || 0);

  // Zero out the first vertex weights (4 floats = 16 bytes)
  binUnweighted.fill(0, offset, offset + 16);
  assert.throws(
    () => validateWeightingGate(doc, binUnweighted),
    /Found 1 unweighted vertices/,
  );

  // 2. Non-normalized weights
  const binNonNormalized = Buffer.from(bin);
  binNonNormalized.writeFloatLE(0.5, offset);
  binNonNormalized.writeFloatLE(0.1, offset + 4);
  binNonNormalized.writeFloatLE(0.0, offset + 8);
  binNonNormalized.writeFloatLE(0.0, offset + 12);
  assert.throws(
    () => validateWeightingGate(doc, binNonNormalized),
    /non-normalized vertices/,
  );
});

test('motion sampling gate rejects missing walk clip or frozen limb locomotion', async () => {
  const bytes = await readFile(ironhideGlbPath);
  const { doc, bin } = unpackGlb(bytes);

  // 1. Missing walk clip
  const docNoWalk = structuredClone(doc);
  docNoWalk.animations = docNoWalk.animations.filter((c) => c.name !== 'walk');
  assert.throws(
    () => validateMotionSampling(docNoWalk, bin),
    /Missing required "walk" animation clip/,
  );

  // 2. Frozen legs (remove leg channels)
  const docFrozenLegs = structuredClone(doc);
  const walkAnim = docFrozenLegs.animations.find((c) => c.name === 'walk');
  walkAnim.channels = [];
  assert.throws(
    () => validateMotionSampling(docFrozenLegs, bin),
    /Locomotion failed/,
  );

  // 3. Exploding vertex displacement
  const docExploding = structuredClone(doc);
  const walkExploding = docExploding.animations.find((c) => c.name === 'walk');
  walkExploding.channels.push({
    sampler: 0,
    target: { node: 0, path: 'translation' },
  });
  const explodeAcc = docExploding.accessors[walkExploding.samplers[0].output];
  explodeAcc.max = [999.0, 999.0, 999.0];
  explodeAcc.min = [-999.0, -999.0, -999.0];
  assert.throws(
    () => validateMotionSampling(docExploding, bin),
    /excessive translation displacement/,
  );
});
