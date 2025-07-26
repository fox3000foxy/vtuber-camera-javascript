import { Euler, Quaternion } from "three";
import { lerp } from "three/src/math/MathUtils.js";
import { VRMUtils } from "@pixiv/three-vrm";

// Temporary objects to avoid creating new instances in animation loop
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();

/**
 * Optimizes VRM model for better performance
 */
export const optimizeVRM = (scene, vrm) => {
  if (vrm._vrmOptimized) return;

  // Remove unnecessary vertices and meshes
  VRMUtils.removeUnnecessaryVertices(scene);
  VRMUtils.combineSkeletons(scene);
  VRMUtils.combineMorphs(vrm);

  // Disable frustum culling for all objects
  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false;
    if (obj.isMesh) obj.matrixAutoUpdate = false;
  });

  vrm._vrmOptimized = true;
};

/**
 * Applies expression with lerp smoothing
 */
export const lerpExpression = (vrm, name, value, lerpFactor) => {
  vrm.expressionManager.setValue(
    name,
    lerp(vrm.expressionManager.getValue(name), value, lerpFactor)
  );
};

/**
 * Rotates a bone with quaternion slerp smoothing
 */
export const rotateBone = (
  vrm,
  boneName,
  value,
  slerpFactor,
  flip = { x: 1, y: 1, z: 1 }
) => {
  const bone = vrm.humanoid.getNormalizedBoneNode(boneName);

  if (!bone || !bone.parent || !bone.parent.visible) {
    return;
  }

  if (!bone) {
    console.warn(`Bone ${boneName} not found in VRM humanoid.`);
    return;
  }

  tmpEuler.set(value.x * flip.x, value.y * flip.y, value.z * flip.z);
  tmpQuat.setFromEuler(tmpEuler);
  bone.quaternion.slerp(tmpQuat, slerpFactor);
};

/**
 * Facial expressions configuration
 */
export const FACIAL_EXPRESSIONS = [
  { name: "aa", valueKey: ["mouth", "shape", "A"] },
  { name: "ih", valueKey: ["mouth", "shape", "I"] },
  { name: "ee", valueKey: ["mouth", "shape", "E"] },
  { name: "oh", valueKey: ["mouth", "shape", "O"] },
  { name: "ou", valueKey: ["mouth", "shape", "U"] },
  { name: "blinkLeft", valueKey: ["eye", "l"], invert: true },
  { name: "blinkRight", valueKey: ["eye", "r"], invert: true },
];

/**
 * Gets nested value from object using key path
 */
const getNestedValue = (obj, keyPath) => {
  return keyPath.reduce((current, key) => current?.[key], obj);
};

/**
 * Applies facial expressions to VRM
 */
export const applyFacialExpressions = (vrm, riggedFace, delta) => {
  if (!riggedFace) return;

  FACIAL_EXPRESSIONS.forEach(({ name, valueKey, invert }) => {
    const value = getNestedValue(riggedFace, valueKey);
    if (value !== undefined) {
      lerpExpression(vrm, name, invert ? 1 - value : value, delta * 12);
    }
  });
};

/**
 * Hand bone configuration for left hand
 */
export const LEFT_HAND_BONES = [
  "leftRingProximal",
  "leftRingIntermediate", 
  "leftRingDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftThumbProximal",
  "leftThumbMetacarpal",
  "leftThumbDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
];

/**
 * Hand bone configuration for right hand
 */
export const RIGHT_HAND_BONES = [
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal", 
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightThumbProximal",
  "rightThumbMetacarpal",
  "rightThumbDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
];

/**
 * Maps bone names to rigged hand property names
 */
const BONE_TO_RIGGED_MAP = {
  // Left hand
  leftRingProximal: "LeftRingProximal",
  leftRingIntermediate: "LeftRingIntermediate",
  leftRingDistal: "LeftRingDistal",
  leftIndexProximal: "LeftIndexProximal",
  leftIndexIntermediate: "LeftIndexIntermediate",
  leftIndexDistal: "LeftIndexDistal",
  leftMiddleProximal: "LeftMiddleProximal",
  leftMiddleIntermediate: "LeftMiddleIntermediate",
  leftMiddleDistal: "LeftMiddleDistal",
  leftThumbProximal: "LeftThumbProximal",
  leftThumbMetacarpal: "LeftThumbIntermediate",
  leftThumbDistal: "LeftThumbDistal",
  leftLittleProximal: "LeftLittleProximal",
  leftLittleIntermediate: "LeftLittleIntermediate",
  leftLittleDistal: "LeftLittleDistal",
  // Right hand
  rightRingProximal: "RightRingProximal",
  rightRingIntermediate: "RightRingIntermediate",
  rightRingDistal: "RightRingDistal",
  rightIndexProximal: "RightIndexProximal",
  rightIndexIntermediate: "RightIndexIntermediate",
  rightIndexDistal: "RightIndexDistal",
  rightMiddleProximal: "RightMiddleProximal",
  rightMiddleIntermediate: "RightMiddleIntermediate",
  rightMiddleDistal: "RightMiddleDistal",
  rightThumbProximal: "RightThumbProximal",
  rightThumbMetacarpal: "RightThumbIntermediate",
  rightThumbDistal: "RightThumbDistal",
  rightLittleProximal: "RightLittleProximal",
  rightLittleIntermediate: "RightLittleIntermediate",
  rightLittleDistal: "RightLittleDistal",
};

/**
 * Applies hand animations to VRM
 */
export const applyHandAnimation = (vrm, handType, riggedPose, riggedHand, delta) => {
  if (!riggedHand) return;

  const isLeft = handType === "left";
  const bones = isLeft ? LEFT_HAND_BONES : RIGHT_HAND_BONES;
  const handBoneName = isLeft ? "leftHand" : "rightHand";
  const poseHandKey = isLeft ? "LeftHand" : "RightHand";
  const wristKey = isLeft ? "LeftWrist" : "RightWrist";

  // Apply hand rotation
  rotateBone(
    vrm,
    handBoneName,
    {
      z: riggedPose[poseHandKey].z,
      y: riggedHand[wristKey].y,
      x: riggedHand[wristKey].x,
    },
    delta * 12
  );

  // Apply finger rotations
  bones.forEach((boneName) => {
    const riggedKey = BONE_TO_RIGGED_MAP[boneName];
    if (riggedHand[riggedKey]) {
      rotateBone(vrm, boneName, riggedHand[riggedKey], delta * 12);
    }
  });
};

/**
 * Applies body pose animations to VRM
 */
export const applyBodyPose = (vrm, riggedPose, delta) => {
  if (!riggedPose) return;

  // Torso
  rotateBone(vrm, "chest", riggedPose.Spine, delta * 1, { x: 0.3, y: 0.3, z: 0.3 });
  rotateBone(vrm, "spine", riggedPose.Spine, delta * 1, { x: 0.3, y: 0.3, z: 0.3 });

  // Arms
  rotateBone(vrm, "leftUpperArm", riggedPose.LeftUpperArm, delta * 5);
  rotateBone(vrm, "leftLowerArm", riggedPose.LeftLowerArm, delta * 5);
  rotateBone(vrm, "rightUpperArm", riggedPose.RightUpperArm, delta * 5);
  rotateBone(vrm, "rightLowerArm", riggedPose.RightLowerArm, delta * 5);
};

/**
 * Applies head/neck rotation
 */
export const applyHeadRotation = (vrm, riggedFace, delta) => {
  if (!riggedFace) return;
  
  rotateBone(vrm, "neck", riggedFace.head, delta * 5, {
    x: 0.7,
    y: 0.7,
    z: 0.7,
  });
};

/**
 * Updates eye look-at target
 */
export const updateEyeLookAt = (vrm, riggedFace, lookAtTarget, lookAtDestination, delta) => {
  if (!lookAtTarget || !riggedFace || !riggedFace.pupil) return;

  vrm.lookAt.target = lookAtTarget;
  lookAtDestination.set(
    2 * riggedFace.pupil.x,
    2 * riggedFace.pupil.y,
    0
  );
  lookAtTarget.position.lerp(lookAtDestination, delta * 5);
};
