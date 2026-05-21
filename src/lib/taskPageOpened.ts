const KEY_PREFIX = 'task-page-opened-';

function storageKey(taskId: string): string {
  return `${KEY_PREFIX}${taskId}`;
}

export function markPageOpened(taskId: string): void {
  sessionStorage.setItem(storageKey(taskId), '1');
}

export function isPageOpened(taskId: string): boolean {
  return sessionStorage.getItem(storageKey(taskId)) === '1';
}

export function clearPageOpened(taskId: string): void {
  sessionStorage.removeItem(storageKey(taskId));
}
