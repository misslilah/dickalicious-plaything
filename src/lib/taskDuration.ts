const KEY_PREFIX = 'task-duration-';

function storageKey(taskId: string): string {
  return `${KEY_PREFIX}${taskId}`;
}

/** Persist duration end time (ISO). Survives tab close and browser restart. */
export function startDuration(taskId: string, seconds: number): void {
  const endAt = new Date(Date.now() + seconds * 1000).toISOString();
  localStorage.setItem(storageKey(taskId), endAt);
}

export function getDurationEndAt(taskId: string): string | null {
  return localStorage.getItem(storageKey(taskId));
}

export function getDurationRemaining(taskId: string): number {
  const endAt = getDurationEndAt(taskId);
  if (!endAt) return 0;
  return Math.max(0, new Date(endAt).getTime() - Date.now());
}

export function isDurationComplete(taskId: string): boolean {
  const endAt = getDurationEndAt(taskId);
  if (!endAt) return false;
  return Date.now() >= new Date(endAt).getTime();
}

export function hasActiveDuration(taskId: string): boolean {
  return getDurationEndAt(taskId) != null && !isDurationComplete(taskId);
}

export function clearDuration(taskId: string): void {
  localStorage.removeItem(storageKey(taskId));
}
