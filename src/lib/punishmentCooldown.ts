import type { Punishment } from '../types';

export const PUNISHMENT_COOLDOWN_HOURS = 6;
export const PUNISHMENT_COOLDOWN_MS = PUNISHMENT_COOLDOWN_HOURS * 60 * 60 * 1000;

export interface PunishmentCooldownEntry {
  templateId: string;
  availableAtMs: number;
}

export function formatPunishmentCooldown(remainingMs: number): string {
  if (remainingMs <= 0) return '';
  const totalMin = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours > 0 && minutes > 0) return `Available in ${hours}h ${minutes}m`;
  if (hours > 0) return `Available in ${hours}h`;
  return `Available in ${minutes}m`;
}

export function punishmentCompletionTime(punishment: Punishment): number | null {
  if (punishment.trigger.type !== 'malus_relief' || !punishment.templateId) {
    return null;
  }
  const raw = punishment.completedAt ?? punishment.assignedAt;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

export function getLocalPunishmentCooldownAvailableAt(
  punishments: Punishment[],
  templateId: string,
): number | null {
  const cutoff = Date.now() - PUNISHMENT_COOLDOWN_MS;
  let lastCompleted = 0;

  for (const punishment of punishments) {
    if (punishment.templateId !== templateId) continue;
    const completedAt = punishmentCompletionTime(punishment);
    if (completedAt == null || completedAt <= cutoff) continue;
    if (completedAt > lastCompleted) lastCompleted = completedAt;
  }

  if (lastCompleted === 0) return null;
  return lastCompleted + PUNISHMENT_COOLDOWN_MS;
}

export function getPunishmentCooldownRemainingMs(
  availableAtMs: number | null | undefined,
): number {
  if (availableAtMs == null) return 0;
  return Math.max(0, availableAtMs - Date.now());
}

export function buildLocalPunishmentCooldownMap(
  punishments: Punishment[],
  templateIds: string[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const templateId of templateIds) {
    const availableAt = getLocalPunishmentCooldownAvailableAt(punishments, templateId);
    if (availableAt != null) map.set(templateId, availableAt);
  }
  return map;
}
