import type { Task, TaskLinkedMediaType } from '../types';

const KEY_PREFIX = 'task-linked-media-';

export type LinkedMediaProgress = {
  completed: boolean;
  failed: boolean;
};

const emptyProgress = (): LinkedMediaProgress => ({
  completed: false,
  failed: false,
});

function storageKey(taskId: string): string {
  return `${KEY_PREFIX}${taskId}`;
}

function load(taskId: string): LinkedMediaProgress {
  try {
    const raw = sessionStorage.getItem(storageKey(taskId));
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<LinkedMediaProgress>;
    return {
      completed: Boolean(parsed.completed),
      failed: Boolean(parsed.failed),
    };
  } catch {
    return emptyProgress();
  }
}

function save(taskId: string, progress: LinkedMediaProgress): void {
  sessionStorage.setItem(storageKey(taskId), JSON.stringify(progress));
}

export function getTaskLinkedMediaType(task: Task): TaskLinkedMediaType {
  return task.linkedMediaType ?? 'none';
}

export function taskHasLinkedMedia(task: Task): boolean {
  const type = getTaskLinkedMediaType(task);
  if (type === 'video') return Boolean(task.linkedVideoId);
  if (type === 'audio') {
    return Boolean(task.linkedAudioItemId) || Boolean(task.linkedAudioUrl?.trim());
  }
  return false;
}

export function getLinkedMediaProgress(taskId: string): LinkedMediaProgress {
  return load(taskId);
}

export function isLinkedMediaComplete(taskId: string): boolean {
  const p = load(taskId);
  return p.completed && !p.failed;
}

export function isLinkedMediaFailed(taskId: string): boolean {
  return load(taskId).failed;
}

export function markLinkedMediaComplete(taskId: string): void {
  save(taskId, { completed: true, failed: false });
}

export function markLinkedMediaFailed(taskId: string): void {
  save(taskId, { completed: false, failed: true });
}

export function clearLinkedMediaProgress(taskId: string): void {
  sessionStorage.removeItem(storageKey(taskId));
}
