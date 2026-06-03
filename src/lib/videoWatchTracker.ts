const SEEK_TOLERANCE_SEC = 1.5;
const MIN_WATCH_RATIO = 0.95;

export type VideoWatchMode = 'normal' | 'forced';

export function createVideoWatchTracker() {
  let maxTimeSec = 0;
  let disqualified = false;

  return {
    reset() {
      maxTimeSec = 0;
      disqualified = false;
    },
    onTimeUpdate(currentTime: number) {
      if (disqualified || !Number.isFinite(currentTime)) return;
      maxTimeSec = Math.max(maxTimeSec, currentTime);
    },
    onSeeking(currentTime: number) {
      if (!Number.isFinite(currentTime)) return;
      if (currentTime > maxTimeSec + SEEK_TOLERANCE_SEC) {
        disqualified = true;
      }
    },
    qualifiesForReward(duration: number, mode: VideoWatchMode): boolean {
      if (mode === 'forced') return true;
      if (disqualified || !Number.isFinite(duration) || duration <= 0) {
        return false;
      }
      return maxTimeSec >= duration * MIN_WATCH_RATIO;
    },
  };
}
