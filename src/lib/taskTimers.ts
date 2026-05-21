const KEY_PREFIX = 'task-timer-';

function storageKey(taskId: string): string {
  return `${KEY_PREFIX}${taskId}`;
}

/** Persist timer end time (ISO). Starts or resumes a countdown for this task. */
export function startTimer(taskId: string, seconds: number): void {
  const endAt = new Date(Date.now() + seconds * 1000).toISOString();
  localStorage.setItem(storageKey(taskId), endAt);
}

export function getEndAt(taskId: string): string | null {
  return localStorage.getItem(storageKey(taskId));
}

export function getRemainingMs(taskId: string): number {
  const endAt = getEndAt(taskId);
  if (!endAt) return 0;
  return Math.max(0, new Date(endAt).getTime() - Date.now());
}

/** True when no timer is stored or the end time has passed. */
export function isTimerComplete(taskId: string): boolean {
  const endAt = getEndAt(taskId);
  if (!endAt) return false;
  return Date.now() >= new Date(endAt).getTime();
}

export function hasActiveTimer(taskId: string): boolean {
  return getEndAt(taskId) != null && !isTimerComplete(taskId);
}

export function clearTimer(taskId: string): void {
  localStorage.removeItem(storageKey(taskId));
}

export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
