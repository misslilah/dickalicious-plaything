const VIDEO_LOOP_SESSION_KEY = 'video-loop-enabled';

export function readVideoLoopPreference(): boolean {
  try {
    return sessionStorage.getItem(VIDEO_LOOP_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeVideoLoopPreference(enabled: boolean): void {
  try {
    sessionStorage.setItem(VIDEO_LOOP_SESSION_KEY, String(enabled));
  } catch {
    // sessionStorage unavailable
  }
}
