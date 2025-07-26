import { Face, Hand, Pose } from "kalidokit";

/**
 * Creates a callback function for processing video recognition results
 */
export const createResultsCallback = (videoElement, riggedFace, riggedPose, riggedLeftHand, riggedRightHand) => {
  return (results) => {
    if (!videoElement) return;

    // Process face landmarks
    if (results.faceLandmarks) {
      riggedFace.current = Face.solve(results.faceLandmarks, {
        runtime: "mediapipe",
        video: videoElement,
        imageSize: { width: 640, height: 480 },
        smoothBlink: false,
        blinkSettings: [0.25, 0.75],
      });
    }

    // Process pose landmarks
    if (results.za && results.poseLandmarks) {
      riggedPose.current = Pose.solve(results.za, results.poseLandmarks, {
        runtime: "mediapipe",
        video: videoElement,
      });
    }

    // Process hand landmarks (switched left and right for mirror effect)
    if (results.leftHandLandmarks) {
      riggedRightHand.current = Hand.solve(results.leftHandLandmarks, "Right");
    } else {
      riggedRightHand.current = null;
    }

    if (results.rightHandLandmarks) {
      riggedLeftHand.current = Hand.solve(results.rightHandLandmarks, "Left");
    } else {
      riggedLeftHand.current = null;
    }
  };
};
