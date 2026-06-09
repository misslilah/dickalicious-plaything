import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildLocalPunishmentCooldownMap,
  formatPunishmentCooldown,
  getPunishmentCooldownRemainingMs,
  PUNISHMENT_COOLDOWN_MS,
} from '../lib/punishmentCooldown';
import { fetchPunishmentCooldowns } from '../lib/punishmentCooldownDb';
import type { Punishment } from '../types';

export function usePunishmentCooldowns(
  templateIds: string[],
  punishments: Punishment[],
  signedIn: boolean,
) {
  const [serverAvailableAt, setServerAvailableAt] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [tick, setTick] = useState(0);

  const templateKey = templateIds.join(',');

  useEffect(() => {
    if (!signedIn) {
      setServerAvailableAt(new Map());
      return;
    }

    let cancelled = false;
    void fetchPunishmentCooldowns().then((result) => {
      if (cancelled || !result.ok) return;
      const next = new Map<string, number>();
      for (const entry of result.cooldowns) {
        next.set(entry.templateId, entry.availableAtMs);
      }
      setServerAvailableAt(next);
    });

    return () => {
      cancelled = true;
    };
  }, [signedIn, templateKey]);

  const localAvailableAt = useMemo(
    () => buildLocalPunishmentCooldownMap(punishments, templateIds),
    [punishments, templateKey],
  );

  const getAvailableAtMs = useCallback(
    (templateId: string): number | null => {
      if (signedIn) {
        const serverAt = serverAvailableAt.get(templateId);
        if (serverAt != null) return serverAt;
      }
      return localAvailableAt.get(templateId) ?? null;
    },
    [signedIn, serverAvailableAt, localAvailableAt],
  );

  const getRemainingMs = useCallback(
    (templateId: string): number => {
      void tick;
      return getPunishmentCooldownRemainingMs(getAvailableAtMs(templateId));
    },
    [getAvailableAtMs, tick],
  );

  const hasActiveCooldown = useMemo(
    () => templateIds.some((templateId) => getRemainingMs(templateId) > 0),
    [templateIds, getRemainingMs],
  );

  useEffect(() => {
    if (!hasActiveCooldown) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveCooldown]);

  const getCooldownLabel = useCallback(
    (templateId: string): string | null => {
      const remainingMs = getRemainingMs(templateId);
      if (remainingMs <= 0) return null;
      return formatPunishmentCooldown(remainingMs);
    },
    [getRemainingMs],
  );

  const isOnCooldown = useCallback(
    (templateId: string): boolean => getRemainingMs(templateId) > 0,
    [getRemainingMs],
  );

  const markTemplateCompleted = useCallback((templateId: string) => {
    setServerAvailableAt((prev) => {
      const next = new Map(prev);
      next.set(templateId, Date.now() + PUNISHMENT_COOLDOWN_MS);
      return next;
    });
  }, []);

  return {
    getRemainingMs,
    getCooldownLabel,
    isOnCooldown,
    markTemplateCompleted,
  };
}
