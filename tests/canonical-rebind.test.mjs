import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { unpackGlb } from '../scripts/creature-pipeline/animation-gltf.mjs';
import { validateRiggedGlb } from '../scripts/creature-pipeline/validate.mjs';
import {
  HUMANOID_ACTION_DONOR,
  HUMANOID_V1_PROFILE,
} from '../scripts/creature-pipeline/rig-profiles.mjs';
import {
  findBlenderPath,
  rebindHumanoidMesh,
} from '../scripts/creature-pipeline/rebind-humanoid.mjs';

test('humanoid-v1 action donor has canonical 65-joint hierarchy and core actions', async () => {
  const donorPath = 'scripts/creature-pipeline/animations/humanoid-action-donor.glb';
  const bytes = await readFile(donorPath);
  const sha = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha, HUMANOID_ACTION_DONOR.sha256, 'donor checksum matches verified hash');

  const { doc } = unpackGlb(bytes);
  assert.equal(doc.meshes, undefined, 'donor must be meshless');
  assert.equal(doc.skins?.length, 1, 'donor has 1 skin');
  assert.equal(doc.skins[0].joints.length, 65, 'donor has 65 canonical joints');

  const clipNames = doc.animations.map((a) => a.name).sort();
  assert.deepEqual(clipNames, [...HUMANOID_ACTION_DONOR.clips].sort());
});

test('humanoid-v1 profile defines canonical hierarchy and role mappings', () => {
  assert.equal(HUMANOID_V1_PROFILE.bodyPlan, 'humanoid-v1');
  assert.equal(HUMANOID_V1_PROFILE.bones, 65);
  assert.equal(HUMANOID_V1_PROFILE.rootBone, 'root');
  assert.equal(HUMANOID_V1_PROFILE.pelvisBone, 'pelvis');
  assert.equal(HUMANOID_V1_PROFILE.headBone, 'Head');
  assert.equal(HUMANOID_V1_PROFILE.armBones.left.length, 3);
  assert.equal(HUMANOID_V1_PROFILE.armBones.right.length, 3);
  assert.equal(HUMANOID_V1_PROFILE.legBones.left.length, 4);
  assert.equal(HUMANOID_V1_PROFILE.legBones.right.length, 4);
});

test('local headless Blender proof rebinds Ironhide mesh to canonical humanoid-v1', async (t) => {
  const meshPath = 'tests/fixtures/creatures/ironhide-mesh.glb';
  if (!existsSync(meshPath)) {
    t.skip('Ironhide mesh fixture not found');
    return;
  }

  const blender = findBlenderPath();
  if (blender === 'blender' && !existsSync('blender')) {
    // In CI environments without blender installed, skip gracefully
    t.skip('Blender executable not installed in environment');
    return;
  }

  const meshBytes = await readFile(meshPath);
  const result = await rebindHumanoidMesh(meshBytes);
  assert.equal(result.report.status, 'rebound');
  assert.equal(result.report.bodyPlan, 'humanoid-v1');
  assert.equal(result.report.blenderReport.boneCount, 65);
  assert.equal(result.report.blenderReport.finalUnweightedVertices, 0);
  assert.ok(result.report.blenderReport.polygonCount > 10000);

  // Validate GLB structure, geometry budgets, weights, and clips
  const gateReport = await validateRiggedGlb(result.bytes, 'humanoid-v1');
  assert.equal(gateReport.bones, 65);
  assert.ok(gateReport.triangles > 15000 && gateReport.triangles <= 40000);
  assert.ok(gateReport.walkClip >= 0, 'has valid locomotion clip');
  assert.ok(gateReport.clips.includes('walk'));
  assert.ok(gateReport.clips.includes('idle'));
  assert.ok(gateReport.clips.includes('attack'));
  assert.ok(gateReport.clips.includes('death'));
});
