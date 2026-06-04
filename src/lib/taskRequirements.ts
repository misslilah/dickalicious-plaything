import type { Task } from '../types';
import { taskHasLinkedMedia } from './taskLinkedMedia';

export function taskHasTimer(task: Task): boolean {
  return (task.timerSeconds ?? 0) > 0;
}

export function taskHasDuration(task: Task): boolean {
  return (task.durationSeconds ?? 0) > 0;
}

export function taskHasOpenUrl(task: Task): boolean {
  return Boolean(task.openUrl?.trim());
}

export function getRequiredPhrase(task: Task): string {
  return (task.requiredPhrase ?? '').trim();
}

export function taskHasPhrase(task: Task): boolean {
  return getRequiredPhrase(task).length > 0;
}

export function taskHasRequirements(task: Task): boolean {
  return (
    taskHasTimer(task) ||
    taskHasDuration(task) ||
    taskHasOpenUrl(task) ||
    taskHasPhrase(task) ||
    taskHasLinkedMedia(task)
  );
}

export { taskHasLinkedMedia } from './taskLinkedMedia';

/** Case-sensitive match; leading/trailing whitespace ignored on both sides. */
export function phraseMatches(input: string, required: string): boolean {
  return input.trim() === (required ?? '').trim();
}
