import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PunishmentTemplate } from '../types';
import {
  isPunishmentPhraseChallengeFailed,
  isPunishmentPhraseChallengePassed,
} from '../lib/punishmentPhraseChallenge';
import {
  punishmentHasOpenUrl,
  punishmentHasPhrase,
  punishmentHasTimer,
} from '../lib/punishmentRequirements';
import { markPageOpened, isPageOpened, clearPageOpened } from '../lib/taskPageOpened';
import {
  clearTimer,
  formatCountdown,
  getEndAt,
  getRemainingMs,
  hasActiveTimer,
  isTimerComplete,
  startTimer,
} from '../lib/taskTimers';

function scopedId(templateId: string): string {
  return `punishment:${templateId}`;
}

export function usePunishmentCompletion(template: PunishmentTemplate) {
  const scopeId = scopedId(template.id);
  const hasTimer = punishmentHasTimer(template);
  const hasPage = punishmentHasOpenUrl(template);
  const hasPhrase = punishmentHasPhrase(template);

  const [remainingMs, setRemainingMs] = useState(() =>
    hasTimer ? getRemainingMs(scopeId) : 0,
  );
  const [pageOpened, setPageOpened] = useState(() =>
    hasPage ? isPageOpened(scopeId) : true,
  );
  const [phraseRevision, setPhraseRevision] = useState(0);

  const refreshPhraseChallenge = useCallback(() => {
    setPhraseRevision((n) => n + 1);
  }, []);

  const phraseChallengePassed = useMemo(() => {
    if (!hasPhrase) return true;
    void phraseRevision;
    return isPunishmentPhraseChallengePassed(template);
  }, [hasPhrase, template, phraseRevision]);

  const phraseChallengeFailed = useMemo(() => {
    if (!hasPhrase) return false;
    void phraseRevision;
    return isPunishmentPhraseChallengeFailed(template.id);
  }, [hasPhrase, template.id, phraseRevision]);

  const tickTimer = useCallback(() => {
    if (!hasTimer) return;
    setRemainingMs(getRemainingMs(scopeId));
  }, [hasTimer, scopeId]);

  useEffect(() => {
    if (!hasTimer) return;
    tickTimer();
  }, [hasTimer, scopeId, tickTimer]);

  useEffect(() => {
    if (!hasTimer) return;
    const id = window.setInterval(tickTimer, 1000);
    const onVisible = () => tickTimer();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [hasTimer, tickTimer]);

  const timerStarted = hasTimer && getEndAt(scopeId) != null;
  const timerRunning = hasTimer && hasActiveTimer(scopeId);
  const timerDone = !hasTimer || isTimerComplete(scopeId);

  const startPunishmentTimer = () => {
    if (!hasTimer || timerStarted) return;
    startTimer(scopeId, template.timerSeconds!);
    tickTimer();
  };

  const openPage = () => {
    const url = template.openUrl?.trim();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    markPageOpened(scopeId);
    setPageOpened(true);
  };

  const pageDone = !hasPage || pageOpened;
  const phraseDone = !hasPhrase || phraseChallengePassed;

  const finishRequirements = () => {
    if (hasTimer) clearTimer(scopeId);
    if (hasPage) clearPageOpened(scopeId);
  };

  return {
    hasTimer,
    hasPage,
    hasPhrase,
    countdown: formatCountdown(remainingMs),
    timerStarted,
    timerRunning,
    timerDone,
    startPunishmentTimer,
    pageOpened,
    phraseDone,
    phraseChallengeFailed,
    refreshPhraseChallenge,
    canComplete:
      timerDone && pageDone && phraseDone && !phraseChallengeFailed,
    openPage,
    finishRequirements,
  };
}

export function clearPunishmentSessionProgress(templateId: string): void {
  const scopeId = scopedId(templateId);
  clearTimer(scopeId);
  clearPageOpened(scopeId);
}
