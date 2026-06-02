import type { NormalizedLandmark } from './facePoseDetection';

const NOSE_TIP = 1;
const INDEX_FINGER_TIP = 8;
const THUMB_TIP = 4;
const WRIST = 0;

/** Max normalized distance (0–1 frame) between hand point and nose for "sniff". */
const SNIFF_DISTANCE_THRESHOLD = 0.14;

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function handPointNearNose(
  nose: NormalizedLandmark,
  point: NormalizedLandmark,
): boolean {
  return dist(nose, point) <= SNIFF_DISTANCE_THRESHOLD;
}

/**
 * True when a hand landmark is near the face nose (poppers / sniff gesture).
 * Uses index tip, thumb tip, or wrist — whichever is closest to the nose.
 */
export function isHandNearNose(
  faceLandmarks: NormalizedLandmark[],
  handLandmarks: NormalizedLandmark[],
): boolean {
  if (faceLandmarks.length < 2 || handLandmarks.length < 9) return false;
  const nose = faceLandmarks[NOSE_TIP];
  return (
    handPointNearNose(nose, handLandmarks[INDEX_FINGER_TIP]) ||
    handPointNearNose(nose, handLandmarks[THUMB_TIP]) ||
    handPointNearNose(nose, handLandmarks[WRIST])
  );
}

/** True if any detected hand is near the nose. */
export function isAnyHandNearNose(
  faceLandmarks: NormalizedLandmark[],
  allHandLandmarks: NormalizedLandmark[][],
): boolean {
  return allHandLandmarks.some((hand) => isHandNearNose(faceLandmarks, hand));
}
