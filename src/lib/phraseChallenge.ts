import type { Task } from '../types';

const KEY_PREFIX = 'phrase-challenge-';

export const MAX_PHRASE_ERRORS = 3;

export type PhraseChallengeState = {
  correctCount: number;
  errorCount: number;
  failed: boolean;
};

const emptyState = (): PhraseChallengeState => ({
  correctCount: 0,
  errorCount: 0,
  failed: false,
});

function storageKey(taskId: string): string {
  return `${KEY_PREFIX}${taskId}`;
}

function load(taskId: string): PhraseChallengeState {
  try {
    const raw = sessionStorage.getItem(storageKey(taskId));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PhraseChallengeState>;
    return {
      correctCount: parsed.correctCount ?? 0,
      errorCount: parsed.errorCount ?? 0,
      failed: Boolean(parsed.failed),
    };
  } catch {
    return emptyState();
  }
}

function save(taskId: string, state: PhraseChallengeState): void {
  sessionStorage.setItem(storageKey(taskId), JSON.stringify(state));
}

export function getPhraseRepeatCount(task: Task): number {
  return Math.max(1, task.requiredPhraseRepeatCount ?? 1);
}

export function getPhraseChallengeState(taskId: string): PhraseChallengeState {
  return load(taskId);
}

export function isPhraseChallengeFailed(taskId: string): boolean {
  return load(taskId).failed;
}

export function isPhraseChallengePassed(task: Task, state?: PhraseChallengeState): boolean {
  if (!(task.requiredPhrase ?? '').trim()) return true;
  const s = state ?? load(task.id);
  if (s.failed) return false;
  return s.correctCount >= getPhraseRepeatCount(task);
}

export function recordPhraseAttempt(
  taskId: string,
  correct: boolean,
  repeatCount: number,
): { state: PhraseChallengeState; passed: boolean; failed: boolean } {
  const current = load(taskId);
  if (current.failed) {
    return { state: current, passed: false, failed: true };
  }

  let next: PhraseChallengeState;
  if (correct) {
    next = {
      ...current,
      correctCount: Math.min(current.correctCount + 1, repeatCount),
    };
  } else {
    const errorCount = Math.min(current.errorCount + 1, MAX_PHRASE_ERRORS);
    next = {
      ...current,
      errorCount,
      failed: errorCount >= MAX_PHRASE_ERRORS,
    };
  }

  save(taskId, next);
  const passed = !next.failed && next.correctCount >= repeatCount;
  return { state: next, passed, failed: next.failed };
}

export function clearPhraseChallenge(taskId: string): void {
  sessionStorage.removeItem(storageKey(taskId));
}
