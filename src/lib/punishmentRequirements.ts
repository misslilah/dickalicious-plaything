import type { PunishmentTemplate } from '../types';
import { phraseMatches } from './taskRequirements';

export function punishmentHasTimer(template: PunishmentTemplate): boolean {
  return (template.timerSeconds ?? 0) > 0;
}

export function punishmentHasOpenUrl(template: PunishmentTemplate): boolean {
  return Boolean(template.openUrl?.trim());
}

export function getRequiredPhrases(template: PunishmentTemplate): string[] {
  return (template.requiredPhrases ?? []).map((p) => p.trim()).filter(Boolean);
}

export function punishmentHasPhrase(template: PunishmentTemplate): boolean {
  return getRequiredPhrases(template).length > 0;
}

export function getPhraseRepeatCount(template: PunishmentTemplate): number {
  return Math.max(1, template.requiredPhraseRepeatCount ?? 1);
}

export function punishmentHasRequirements(template: PunishmentTemplate): boolean {
  return (
    punishmentHasTimer(template) ||
    punishmentHasOpenUrl(template) ||
    punishmentHasPhrase(template)
  );
}

export function isValidOpenUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.length > 0 && /^https?:\/\//i.test(trimmed);
}

export function parsePhrasesFromText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function phrasesToText(phrases: string[] | undefined): string {
  return (phrases ?? []).join('\n');
}

export { phraseMatches };
