const SEEK_TOLERANCE_SEC = 1.5;
const MIN_WATCH_RATIO = 0.95;
const PARTIAL_MIN_SECONDS = 5;
const PARTIAL_MIN_RATIO = 0.1;

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
    qualifiesForPartialView(duration: number): boolean {
      if (!Number.isFinite(maxTimeSec) || maxTimeSec <= 0) return false;
      if (!Number.isFinite(duration) || duration <= 0) {
        return maxTimeSec >= PARTIAL_MIN_SECONDS;
      }
      return (
        maxTimeSec >= PARTIAL_MIN_SECONDS ||
        maxTimeSec >= duration * PARTIAL_MIN_RATIO
      );
    },
    watchPercent(duration: number): number | null {
      if (!Number.isFinite(duration) || duration <= 0) return null;
      const pct = (maxTimeSec / duration) * 100;
      return Math.min(100, Math.round(pct * 100) / 100);
    },
  };
}
