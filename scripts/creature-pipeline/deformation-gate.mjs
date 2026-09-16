import * as THREE from 'three';
import { unpackGlb, hierarchy, values } from './animation-gltf.mjs';
import { HUMANOID_V1_PROFILE, RigCompatibilityError } from './rig-profiles.mjs';

export class DeformationGateError extends Error {}

export function validateHumanoidHierarchy(doc) {
  if (!doc.skins?.length) {
    throw new DeformationGateError('Asset has no skins.');
  }
  const skin = doc.skins[0];
  const jointNodes = skin.joints.map((j) => doc.nodes[j]);
  const jointNames = new Set(jointNodes.map((n) => n.name));

  if (skin.joints.length !== HUMANOID_V1_PROFILE.bones) {
    throw new DeformationGateError(
      `Joint count mismatch: expected ${HUMANOID_V1_PROFILE.bones}, got ${skin.joints.length}.`,
    );
  }

  // Check required key bones
  const requiredBones = [
    HUMANOID_V1_PROFILE.rootBone,
    HUMANOID_V1_PROFILE.pelvisBone,
    ...HUMANOID_V1_PROFILE.spineBones,
    HUMANOID_V1_PROFILE.neckBone,
    HUMANOID_V1_PROFILE.headBone,
    HUMANOID_V1_PROFILE.clavicleBones.left,
    HUMANOID_V1_PROFILE.clavicleBones.right,
    ...HUMANOID_V1_PROFILE.armBones.left,
    ...HUMANOID_V1_PROFILE.armBones.right,
    ...HUMANOID_V1_PROFILE.legBones.left,
    ...HUMANOID_V1_PROFILE.legBones.right,
  ];

  for (const b of requiredBones) {
    if (!jointNames.has(b)) {
      throw new DeformationGateError(`Missing required canonical joint: ${b}.`);
    }
  }

  // Verify parent-child chain continuity
  function verifyChain(names) {
    for (let i = 1; i < names.length; i++) {
      const parentName = names[i - 1];
      const childName = names[i];
      const parentIdx = doc.nodes.findIndex((n) => n.name === parentName);
      const childIdx = doc.nodes.findIndex((n) => n.name === childName);
      if (!doc.nodes[parentIdx]?.children?.includes(childIdx)) {
        throw new DeformationGateError(
          `Broken hierarchy chain: ${childName} is not a child of ${parentName}.`,
        );
      }
    }
  }

  verifyChain([
    HUMANOID_V1_PROFILE.rootBone,
    HUMANOID_V1_PROFILE.pelvisBone,
    ...HUMANOID_V1_PROFILE.spineBones,
    HUMANOID_V1_PROFILE.neckBone,
    HUMANOID_V1_PROFILE.headBone,
  ]);

  verifyChain(['spine_03', 'clavicle_l', ...HUMANOID_V1_PROFILE.armBones.left]);
  verifyChain(['spine_03', 'clavicle_r', ...HUMANOID_V1_PROFILE.armBones.right]);
  verifyChain(['pelvis', ...HUMANOID_V1_PROFILE.legBones.left]);
  verifyChain(['pelvis', ...HUMANOID_V1_PROFILE.legBones.right]);

  return true;
}

export function validateWeightingGate(doc, bin) {
  const skin = doc.skins[0];
  const jointIndexToName = new Map(skin.joints.map((j, i) => [i, doc.nodes[j].name]));
  const boneWeightedCounts = new Map(skin.joints.map((j) => [doc.nodes[j].name, 0]));

  let totalVertices = 0;
  let unweightedVertices = 0;
  let nonNormalizedVertices = 0;
  let maxInfluences = 0;

  for (const node of doc.nodes || []) {
    if (node.mesh === undefined) continue;
    const mesh = doc.meshes[node.mesh];
    for (const primitive of mesh.primitives) {
      if (primitive.attributes.JOINTS_0 === undefined || primitive.attributes.WEIGHTS_0 === undefined) {
        throw new DeformationGateError('Skinned primitive missing JOINTS_0 or WEIGHTS_0 attribute.');
      }
      const jointsAcc = doc.accessors[primitive.attributes.JOINTS_0];
      const weightsAcc = doc.accessors[primitive.attributes.WEIGHTS_0];
      const count = jointsAcc.count;
      totalVertices += count;

      const jointView = doc.bufferViews[jointsAcc.bufferView];
      const weightView = doc.bufferViews[weightsAcc.bufferView];

      const jointOffset = (jointView.byteOffset || 0) + (jointsAcc.byteOffset || 0);
      const weightOffset = (weightView.byteOffset || 0) + (weightsAcc.byteOffset || 0);

      const jointComponentType = jointsAcc.componentType; // 5121 (UNSIGNED_BYTE) or 5123 (UNSIGNED_SHORT)
      const isByte = jointComponentType === 5121;

      const posAcc = primitive.attributes.POSITION !== undefined ? doc.accessors[primitive.attributes.POSITION] : null;
      const posView = posAcc ? doc.bufferViews[posAcc.bufferView] : null;
      const posOffset = posAcc && posView ? (posView.byteOffset || 0) + (posAcc.byteOffset || 0) : 0;

      for (let v = 0; v < count; v++) {
        let weightSum = 0;
        let activeWeights = 0;
        const vx = posAcc ? bin.readFloatLE(posOffset + v * 12) : 0;

        for (let comp = 0; comp < 4; comp++) {
          const jVal = isByte
            ? bin.readUInt8(jointOffset + v * 4 + comp)
            : bin.readUInt16LE(jointOffset + v * 8 + comp * 2);
          const wVal = bin.readFloatLE(weightOffset + v * 16 + comp * 4);

          if (wVal > 0.001) {
            activeWeights++;
            weightSum += wVal;
            const bName = jointIndexToName.get(jVal);
            if (bName) {
              boneWeightedCounts.set(bName, (boneWeightedCounts.get(bName) || 0) + 1);
              if (Math.abs(vx) > 0.35 && ['thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'].includes(bName)) {
                throw new DeformationGateError(`Cross-limb bleeding: leg bone ${bName} weighted on arm extremity (x=${vx.toFixed(2)}).`);
              }
            }
          }
        }

        if (activeWeights > maxInfluences) maxInfluences = activeWeights;
        if (activeWeights === 0) unweightedVertices++;
        if (Math.abs(weightSum - 1.0) > 0.02) nonNormalizedVertices++;
      }
    }
  }

  if (unweightedVertices > 0) {
    throw new DeformationGateError(`Found ${unweightedVertices} unweighted vertices.`);
  }

  if (nonNormalizedVertices > 0) {
    throw new DeformationGateError(`Found ${nonNormalizedVertices} non-normalized vertices.`);
  }

  if (maxInfluences > 4) {
    throw new DeformationGateError(`Exceeded influence limit: found vertex with ${maxInfluences} influences.`);
  }

  if ((boneWeightedCounts.get('root') || 0) > 0) {
    throw new DeformationGateError('Root bone must not deform geometry.');
  }

  for (const [bName, count] of boneWeightedCounts.entries()) {
    if (bName.includes('_leaf_') && count > 0) {
      throw new DeformationGateError(`Leaf bone ${bName} must not have vertex weights (found ${count}).`);
    }
  }

  // Verify critical body region coverage
  const criticalGroups = {
    pelvis_spine: ['pelvis', 'spine_01', 'spine_02'],
    head: ['Head', 'neck_01'],
    left_arm: ['upperarm_l', 'lowerarm_l', 'hand_l'],
    right_arm: ['upperarm_r', 'lowerarm_r', 'hand_r'],
    left_leg: ['thigh_l', 'calf_l', 'foot_l'],
    right_leg: ['thigh_r', 'calf_r', 'foot_r'],
  };

  const minLimbVerts = Math.max(5, Math.floor(totalVertices * 0.005));
  for (const [groupName, bones] of Object.entries(criticalGroups)) {
    const groupCount = bones.reduce((sum, b) => sum + (boneWeightedCounts.get(b) || 0), 0);
    if (groupCount < minLimbVerts) {
      throw new DeformationGateError(
        `Critical region ${groupName} under-weighted: has ${groupCount} vertex influences, minimum is ${minLimbVerts}.`,
      );
    }
  }

  return { totalVertices, boneWeightedCounts, maxInfluences };
}

export function validateMotionSampling(doc, bin) {
  const clips = doc.animations || [];
  if (!clips.length) {
    throw new DeformationGateError('No animation clips to sample.');
  }

  const walkClip = clips.find((c) => c.name === 'walk');
  if (!walkClip) {
    throw new DeformationGateError('Missing required "walk" animation clip.');
  }

  // Build node lookup
  const skin = doc.skins[0];
  const nodeNameToIndex = new Map(doc.nodes.map((n, i) => [n.name, i]));
  const jointIndices = new Set(skin.joints);

  // Check that locomotion animates limb joints over time
  const legBones = [
    ...HUMANOID_V1_PROFILE.legBones.left,
    ...HUMANOID_V1_PROFILE.legBones.right,
  ];
  const legNodeIndices = new Set(
    legBones.map((b) => nodeNameToIndex.get(b)).filter((i) => i !== undefined),
  );

  let legChannelsAnimated = 0;
  for (const channel of walkClip.channels) {
    if (legNodeIndices.has(channel.target.node)) {
      const sampler = walkClip.samplers[channel.sampler];
      const outputAcc = doc.accessors[sampler.output];
      if (outputAcc.count > 1) {
        legChannelsAnimated++;
      }
    }
  }

  if (legChannelsAnimated < 4) {
    throw new DeformationGateError(
      `Locomotion failed: only ${legChannelsAnimated} leg animation channels found (expected at least 4 active leg channels).`,
    );
  }

  // Check for extreme vertex displacement / explosion
  for (const clip of clips) {
    for (const channel of clip.channels) {
      if (channel.target.path === 'translation') {
        const sampler = clip.samplers[channel.sampler];
        const outputAcc = doc.accessors[sampler.output];
        if (outputAcc.max && outputAcc.min) {
          const maxDisplacement = Math.max(
            ...outputAcc.max.map((v) => Math.abs(v)),
            ...outputAcc.min.map((v) => Math.abs(v)),
          );
          if (maxDisplacement > 20.0) {
            throw new DeformationGateError(
              `Clip ${clip.name} has excessive translation displacement: ${maxDisplacement}m.`,
            );
          }
        }
      }
    }
  }

  return {
    sampledClips: clips.map((c) => c.name),
    legChannelsAnimated,
  };
}

export function validateDeformationGates(bytes) {
  const { doc, bin } = unpackGlb(bytes);
  const hierarchyReport = validateHumanoidHierarchy(doc);
  const weightReport = validateWeightingGate(doc, bin);
  const motionReport = validateMotionSampling(doc, bin);

  return {
    status: 'passed',
    bodyPlan: 'humanoid-v1',
    hierarchy: hierarchyReport,
    vertices: weightReport.totalVertices,
    maxInfluences: weightReport.maxInfluences,
    sampledClips: motionReport.sampledClips,
    legChannelsAnimated: motionReport.legChannelsAnimated,
  };
}
