import type { Task } from '../types';

export function taskHasTimer(task: Task): boolean {
  return (task.timerSeconds ?? 0) > 0;
}

export function taskHasOpenUrl(task: Task): boolean {
  return Boolean(task.openUrl?.trim());
}

export function taskHasPhrase(task: Task): boolean {
  return Boolean(task.requiredPhrase?.trim());
}

export function taskHasRequirements(task: Task): boolean {
  return taskHasTimer(task) || taskHasOpenUrl(task) || taskHasPhrase(task);
}

/** Case-sensitive match; leading/trailing whitespace ignored on both sides. */
export function phraseMatches(input: string, required: string): boolean {
  return input.trim() === required.trim();
}
