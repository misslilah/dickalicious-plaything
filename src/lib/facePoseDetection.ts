/**
 * Heuristic face-pose helpers for MediaPipe Face Landmarker landmarks.
 *
 * Gaze left/right blends nose offset, cheek asymmetry, eye-corner spread, and
 * iris-in-socket position (478-point model). Signals are mirror-corrected so
 * negative = user's left (toward the left UI panel in the mirrored selfie).
 *
 * Mouth open uses MAR (mouth aspect ratio).
 * Tongue-out is best-effort: very wide mouth held briefly — not true tongue segmentation.
 */

export type NormalizedLandmark = { x: number; y: number; z?: number };

/** MediaPipe face mesh indices used below. */
const NOSE_TIP = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
const UPPER_LIP = 13;
const LOWER_LIP = 14;
const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;
const LEFT_EYE_INNER = 133;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;
/** Iris centers — present when Face Landmarker returns all 478 landmarks. */
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
/** Eye aspect ratio (EAR) landmark rings. */
const LEFT_EYE_EAR = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE_EAR = [263, 387, 385, 362, 380, 373] as const;

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Iris horizontal position within the eye socket: 0 = toward outer corner, 1 = toward inner. */
function irisPositionInEye(
  inner: NormalizedLandmark,
  outer: NormalizedLandmark,
  iris: NormalizedLandmark,
): number {
  const minX = Math.min(inner.x, outer.x);
  const maxX = Math.max(inner.x, outer.x);
  const span = Math.max(maxX - minX, 0.005);
  return (iris.x - minX) / span;
}

/**
 * Nose offset vs cheek midpoint, mirror-corrected for front-camera user POV.
 * Negative ≈ user look left; positive ≈ user look right.
 */
function noseYawUserPov(landmarks: NormalizedLandmark[]): number | null {
  if (landmarks.length < 455) return null;
  const nose = landmarks[NOSE_TIP];
  const left = landmarks[LEFT_CHEEK];
  const right = landmarks[RIGHT_CHEEK];
  const faceWidth = Math.max(dist(left, right), 0.02);
  const centerX = (left.x + right.x) / 2;
  // Raw stream is not mirrored; flip sign so left matches the on-screen left panel.
  return (centerX - nose.x) / faceWidth;
}

/** Cheek distance asymmetry — nearer cheek shrinks when the user turns toward it. */
function cheekAsymmetryYaw(landmarks: NormalizedLandmark[]): number | null {
  if (landmarks.length < 455) return null;
  const nose = landmarks[NOSE_TIP];
  const left = landmarks[LEFT_CHEEK];
  const right = landmarks[RIGHT_CHEEK];
  const faceWidth = Math.max(dist(left, right), 0.02);
  return (dist(nose, left) - dist(nose, right)) / faceWidth;
}

/** Outer-eye corner spread relative to the nose — reinforces head yaw. */
function eyeCornerYaw(landmarks: NormalizedLandmark[]): number | null {
  if (landmarks.length < 363) return null;
  const nose = landmarks[NOSE_TIP];
  const leftOuter = landmarks[LEFT_EYE_OUTER];
  const rightOuter = landmarks[RIGHT_EYE_OUTER];
  const left = landmarks[LEFT_CHEEK];
  const right = landmarks[RIGHT_CHEEK];
  const faceWidth = Math.max(dist(left, right), 0.02);
  const leftSpan = Math.abs(nose.x - leftOuter.x);
  const rightSpan = Math.abs(rightOuter.x - nose.x);
  return (leftSpan - rightSpan) / faceWidth;
}

/**
 * Iris gaze: left iris toward outer + right iris toward inner ≈ user look left.
 * Returns roughly -0.35 … +0.35 for strong horizontal gaze.
 */
function irisGazeYaw(landmarks: NormalizedLandmark[]): number | null {
  if (landmarks.length < 478) return null;
  const leftRatio = irisPositionInEye(
    landmarks[LEFT_EYE_INNER],
    landmarks[LEFT_EYE_OUTER],
    landmarks[LEFT_IRIS_CENTER],
  );
  const rightRatio = irisPositionInEye(
    landmarks[RIGHT_EYE_INNER],
    landmarks[RIGHT_EYE_OUTER],
    landmarks[RIGHT_IRIS_CENTER],
  );
  return (leftRatio - rightRatio) * 0.35;
}

/** Blend weights for combined gaze (iris weight redistributed when unavailable). */
const WEIGHT_NOSE = 0.35;
const WEIGHT_CHEEK = 0.25;
const WEIGHT_EYE = 0.15;
const WEIGHT_IRIS = 0.25;

/**
 * Combined horizontal gaze score from multiple landmarks.
 * Negative ≈ user look left; positive ≈ user look right.
 */
export function gazeYawRatio(landmarks: NormalizedLandmark[]): number | null {
  const nose = noseYawUserPov(landmarks);
  const cheek = cheekAsymmetryYaw(landmarks);
  const eye = eyeCornerYaw(landmarks);
  const iris = irisGazeYaw(landmarks);

  const parts: { value: number; weight: number }[] = [];
  if (nose !== null) parts.push({ value: nose, weight: WEIGHT_NOSE });
  if (cheek !== null) parts.push({ value: cheek, weight: WEIGHT_CHEEK });
  if (eye !== null) parts.push({ value: eye, weight: WEIGHT_EYE });
  if (iris !== null) parts.push({ value: iris, weight: WEIGHT_IRIS });

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.value * (part.weight / totalWeight), 0);
}

/** @deprecated Prefer gazeYawRatio — kept for compatibility. */
export function headYawRatio(landmarks: NormalizedLandmark[]): number | null {
  return gazeYawRatio(landmarks);
}

/** Exponential moving average for gaze smoothing (see FollowInstinctGamePlayer). */
export function smoothGazeSample(previous: number | null, sample: number, alpha: number): number {
  if (previous === null) return sample;
  return previous + alpha * (sample - previous);
}

export function mouthAspectRatio(landmarks: NormalizedLandmark[]): number | null {
  if (landmarks.length < 292) return null;
  const vertical = dist(landmarks[UPPER_LIP], landmarks[LOWER_LIP]);
  const horizontal = Math.max(dist(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]), 0.02);
  return vertical / horizontal;
}

/**
 * Delta thresholds applied after per-round neutral calibration.
 * Lower than the old absolute ±0.12 because we measure change from baseline.
 */
const GAZE_DELTA_LOOK_LEFT = -0.055;
const GAZE_DELTA_LOOK_RIGHT = 0.055;

/** Absolute fallback thresholds when no baseline is available yet. */
const GAZE_ABS_LOOK_LEFT = -0.09;
const GAZE_ABS_LOOK_RIGHT = 0.09;

const MAR_MOUTH_OPEN = 0.28;
/** Tongue heuristic — very open mouth; see component for hold duration. */
export const MAR_TONGUE_HEURISTIC = 0.42;

export function isLookingLeft(gaze: number | null, baseline: number | null = null): boolean {
  if (gaze === null) return false;
  if (baseline !== null) {
    return gaze - baseline <= GAZE_DELTA_LOOK_LEFT;
  }
  return gaze <= GAZE_ABS_LOOK_LEFT;
}

export function isLookingRight(gaze: number | null, baseline: number | null = null): boolean {
  if (gaze === null) return false;
  if (baseline !== null) {
    return gaze - baseline >= GAZE_DELTA_LOOK_RIGHT;
  }
  return gaze >= GAZE_ABS_LOOK_RIGHT;
}

export function isMouthOpen(mar: number | null): boolean {
  return mar !== null && mar >= MAR_MOUTH_OPEN;
}

export function isTongueHeuristic(mar: number | null): boolean {
  return mar !== null && mar >= MAR_TONGUE_HEURISTIC;
}

function singleEyeAspectRatio(
  landmarks: NormalizedLandmark[],
  indices: readonly [number, number, number, number, number, number],
): number | null {
  if (landmarks.length <= Math.max(...indices)) return null;
  const p1 = landmarks[indices[0]];
  const p2 = landmarks[indices[1]];
  const p3 = landmarks[indices[2]];
  const p4 = landmarks[indices[3]];
  const p5 = landmarks[indices[4]];
  const p6 = landmarks[indices[5]];
  const verticalA = dist(p2, p6);
  const verticalB = dist(p3, p5);
  const horizontal = Math.max(dist(p1, p4), 0.005);
  return (verticalA + verticalB) / (2 * horizontal);
}

/** Eye aspect ratio — lower values mean the eye is more closed. */
export function eyeAspectRatio(landmarks: NormalizedLandmark[]): number | null {
  const left = singleEyeAspectRatio(landmarks, LEFT_EYE_EAR);
  const right = singleEyeAspectRatio(landmarks, RIGHT_EYE_EAR);
  if (left === null && right === null) return null;
  if (left === null) return right;
  if (right === null) return left;
  return (left + right) / 2;
}

const EAR_EYES_CLOSED = 0.2;

export function areEyesClosed(ear: number | null): boolean {
  return ear !== null && ear < EAR_EYES_CLOSED;
}
