/**
 * Heuristic face-pose helpers for MediaPipe Face Landmarker landmarks.
 * Gaze left/right uses nose offset vs face width (mirrored front camera).
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

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Nose horizontal offset vs face center, normalized by face width. Negative ≈ look left. */
export function headYawRatio(landmarks: NormalizedLandmark[]): number | null {
  if (landmarks.length < 455) return null;
  const nose = landmarks[NOSE_TIP];
  const left = landmarks[LEFT_CHEEK];
  const right = landmarks[RIGHT_CHEEK];
  const faceWidth = Math.max(dist(left, right), 0.02);
  const centerX = (left.x + right.x) / 2;
  return (nose.x - centerX) / faceWidth;
}

export function mouthAspectRatio(landmarks: NormalizedLandmark[]): number | null {
  if (landmarks.length < 292) return null;
  const vertical = dist(landmarks[UPPER_LIP], landmarks[LOWER_LIP]);
  const horizontal = Math.max(dist(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]), 0.02);
  return vertical / horizontal;
}

/** Mirrored selfie: user's left turn pushes nose x lower → negative yaw. */
const YAW_LOOK_LEFT = -0.12;
const YAW_LOOK_RIGHT = 0.12;
const MAR_MOUTH_OPEN = 0.28;
/** Tongue heuristic — very open mouth; see component for hold duration. */
export const MAR_TONGUE_HEURISTIC = 0.42;

export function isLookingLeft(yaw: number | null): boolean {
  return yaw !== null && yaw <= YAW_LOOK_LEFT;
}

export function isLookingRight(yaw: number | null): boolean {
  return yaw !== null && yaw >= YAW_LOOK_RIGHT;
}

export function isMouthOpen(mar: number | null): boolean {
  return mar !== null && mar >= MAR_MOUTH_OPEN;
}

export function isTongueHeuristic(mar: number | null): boolean {
  return mar !== null && mar >= MAR_TONGUE_HEURISTIC;
}
