import type { PunishmentTemplate } from '../types';
import { getPhraseRepeatCount, getRequiredPhrases } from './punishmentRequirements';

const KEY_PREFIX = 'punishment-phrase-';

export const MAX_PUNISHMENT_PHRASE_ERRORS = 3;

export type PunishmentPhraseChallengeState = {
  phraseIndex: number;
  correctCount: number;
  errorCount: number;
  failed: boolean;
};

const emptyState = (): PunishmentPhraseChallengeState => ({
  phraseIndex: 0,
  correctCount: 0,
  errorCount: 0,
  failed: false,
});

function storageKey(templateId: string): string {
  return `${KEY_PREFIX}${templateId}`;
}

function load(templateId: string): PunishmentPhraseChallengeState {
  try {
    const raw = sessionStorage.getItem(storageKey(templateId));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<PunishmentPhraseChallengeState>;
    return {
      phraseIndex: parsed.phraseIndex ?? 0,
      correctCount: parsed.correctCount ?? 0,
      errorCount: parsed.errorCount ?? 0,
      failed: Boolean(parsed.failed),
    };
  } catch {
    return emptyState();
  }
}

function save(templateId: string, state: PunishmentPhraseChallengeState): void {
  sessionStorage.setItem(storageKey(templateId), JSON.stringify(state));
}

export function getPunishmentPhraseChallengeState(
  templateId: string,
): PunishmentPhraseChallengeState {
  return load(templateId);
}

export function isPunishmentPhraseChallengeFailed(templateId: string): boolean {
  return load(templateId).failed;
}

export function isPunishmentPhraseChallengePassed(
  template: PunishmentTemplate,
  state?: PunishmentPhraseChallengeState,
): boolean {
  const phrases = getRequiredPhrases(template);
  if (phrases.length === 0) return true;
  const s = state ?? load(template.id);
  if (s.failed) return false;
  return s.phraseIndex >= phrases.length;
}

export function getCurrentPunishmentPhrase(
  template: PunishmentTemplate,
  state?: PunishmentPhraseChallengeState,
): string | null {
  const phrases = getRequiredPhrases(template);
  if (phrases.length === 0) return null;
  const s = state ?? load(template.id);
  if (s.phraseIndex >= phrases.length) return null;
  return phrases[s.phraseIndex] ?? null;
}

export function recordPunishmentPhraseAttempt(
  template: PunishmentTemplate,
  correct: boolean,
): {
  state: PunishmentPhraseChallengeState;
  passed: boolean;
  failed: boolean;
} {
  const phrases = getRequiredPhrases(template);
  const repeatCount = getPhraseRepeatCount(template);
  const current = load(template.id);
  if (current.failed || phrases.length === 0) {
    return { state: current, passed: false, failed: current.failed };
  }

  let next: PunishmentPhraseChallengeState;
  if (correct) {
    const correctCount = Math.min(current.correctCount + 1, repeatCount);
    if (correctCount >= repeatCount) {
      next = {
        phraseIndex: current.phraseIndex + 1,
        correctCount: 0,
        errorCount: current.errorCount,
        failed: false,
      };
    } else {
      next = {
        ...current,
        correctCount,
      };
    }
  } else {
    const errorCount = Math.min(
      current.errorCount + 1,
      MAX_PUNISHMENT_PHRASE_ERRORS,
    );
    next = {
      ...current,
      errorCount,
      failed: errorCount >= MAX_PUNISHMENT_PHRASE_ERRORS,
    };
  }

  save(template.id, next);
  const passed = !next.failed && next.phraseIndex >= phrases.length;
  return { state: next, passed, failed: next.failed };
}

export function clearPunishmentPhraseChallenge(templateId: string): void {
  sessionStorage.removeItem(storageKey(templateId));
}

export function clearPunishmentCompletionProgress(templateId: string): void {
  clearPunishmentPhraseChallenge(templateId);
}
