import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../types';
import { markPageOpened, isPageOpened } from '../lib/taskPageOpened';
import {
  clearPhraseChallenge,
  getPhraseChallengeState,
  isPhraseChallengeFailed,
  isPhraseChallengePassed,
} from '../lib/phraseChallenge';
import {
  formatCountdown,
  getEndAt,
  getRemainingMs,
  hasActiveTimer,
  isTimerComplete,
  startTimer,
  clearTimer,
} from '../lib/taskTimers';
import {
  clearDuration,
  getDurationEndAt,
  getDurationRemaining,
  hasActiveDuration,
  isDurationComplete,
  startDuration,
} from '../lib/taskDuration';
import {
  clearLinkedMediaProgress,
  isLinkedMediaComplete,
  isLinkedMediaFailed,
  taskHasLinkedMedia,
} from '../lib/taskLinkedMedia';
import {
  taskHasDuration,
  taskHasOpenUrl,
  taskHasPhrase,
  taskHasTimer,
} from '../lib/taskRequirements';

export function useTaskCompletion(task: Task, completed: boolean) {
  const hasTimer = taskHasTimer(task);
  const hasDuration = taskHasDuration(task);
  const hasPage = taskHasOpenUrl(task);
  const hasPhrase = taskHasPhrase(task);
  const hasLinkedMedia = taskHasLinkedMedia(task);

  const [remainingMs, setRemainingMs] = useState(() =>
    hasTimer ? getRemainingMs(task.id) : 0,
  );
  const [durationRemainingMs, setDurationRemainingMs] = useState(() =>
    hasDuration ? getDurationRemaining(task.id) : 0,
  );
  const [pageOpened, setPageOpened] = useState(() =>
    hasPage ? isPageOpened(task.id) : true,
  );
  const [phraseRevision, setPhraseRevision] = useState(0);
  const [mediaRevision, setMediaRevision] = useState(0);

  const refreshPhraseChallenge = useCallback(() => {
    setPhraseRevision((n) => n + 1);
  }, []);

  const refreshLinkedMedia = useCallback(() => {
    setMediaRevision((n) => n + 1);
  }, []);

  const phraseChallengePassed = useMemo(() => {
    if (!hasPhrase) return true;
    void phraseRevision;
    return isPhraseChallengePassed(task);
  }, [hasPhrase, task, phraseRevision]);

  const phraseChallengeFailed = useMemo(() => {
    if (!hasPhrase) return false;
    void phraseRevision;
    return isPhraseChallengeFailed(task.id);
  }, [hasPhrase, task.id, phraseRevision]);

  const phraseChallengeState = useMemo(() => {
    if (!hasPhrase) return null;
    void phraseRevision;
    return getPhraseChallengeState(task.id);
  }, [hasPhrase, task.id, phraseRevision]);

  const linkedMediaDone = useMemo(() => {
    if (!hasLinkedMedia) return true;
    void mediaRevision;
    return isLinkedMediaComplete(task.id);
  }, [hasLinkedMedia, task.id, mediaRevision]);

  const linkedMediaFailed = useMemo(() => {
    if (!hasLinkedMedia) return false;
    void mediaRevision;
    return isLinkedMediaFailed(task.id);
  }, [hasLinkedMedia, task.id, mediaRevision]);

  const prevCompleted = useRef(completed);
  useEffect(() => {
    if (prevCompleted.current && !completed && hasPhrase) {
      clearPhraseChallenge(task.id);
      refreshPhraseChallenge();
    }
    prevCompleted.current = completed;
  }, [completed, hasPhrase, task.id, refreshPhraseChallenge]);

  const tickTimer = useCallback(() => {
    if (!hasTimer) return;
    setRemainingMs(getRemainingMs(task.id));
  }, [hasTimer, task.id]);

  const tickDuration = useCallback(() => {
    if (!hasDuration) return;
    setDurationRemainingMs(getDurationRemaining(task.id));
  }, [hasDuration, task.id]);

  useEffect(() => {
    if (!hasTimer || completed) return;
    tickTimer();
  }, [hasTimer, completed, task.id, tickTimer]);

  useEffect(() => {
    if (!hasDuration || completed) return;
    tickDuration();
  }, [hasDuration, completed, task.id, tickDuration]);

  useEffect(() => {
    if (!hasTimer || completed) return;
    const id = window.setInterval(tickTimer, 1000);
    const onVisible = () => tickTimer();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [hasTimer, completed, tickTimer]);

  useEffect(() => {
    if (!hasDuration || completed) return;
    const id = window.setInterval(tickDuration, 1000);
    const onVisible = () => tickDuration();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [hasDuration, completed, tickDuration]);

  const timerStarted = hasTimer && getEndAt(task.id) != null;
  const timerRunning = hasTimer && hasActiveTimer(task.id);
  const timerDone = !hasTimer || isTimerComplete(task.id);

  const durationStarted = hasDuration && getDurationEndAt(task.id) != null;
  const durationRunning = hasDuration && hasActiveDuration(task.id);
  const durationDone = !hasDuration || isDurationComplete(task.id);

  const startTaskTimer = () => {
    if (!hasTimer || completed || timerStarted) return;
    startTimer(task.id, task.timerSeconds!);
    tickTimer();
  };

  const startTaskDuration = () => {
    if (!hasDuration || completed || durationStarted) return;
    startDuration(task.id, task.durationSeconds!);
    tickDuration();
  };

  const pageDone = !hasPage || pageOpened;
  const phraseDone = !hasPhrase || phraseChallengePassed;

  const openPage = () => {
    const url = task.openUrl?.trim();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    markPageOpened(task.id);
    setPageOpened(true);
  };

  const finishRequirements = () => {
    if (hasTimer) clearTimer(task.id);
    if (hasDuration) clearDuration(task.id);
    if (hasPhrase) clearPhraseChallenge(task.id);
    if (hasLinkedMedia) clearLinkedMediaProgress(task.id);
  };

  return {
    hasTimer,
    hasDuration,
    hasPage,
    hasPhrase,
    hasLinkedMedia,
    linkedMediaDone,
    linkedMediaFailed,
    refreshLinkedMedia,
    remainingMs,
    countdown: formatCountdown(remainingMs),
    durationCountdown: formatCountdown(durationRemainingMs),
    timerStarted,
    timerRunning,
    timerDone,
    startTaskTimer,
    durationStarted,
    durationRunning,
    durationDone,
    startTaskDuration,
    pageOpened,
    phraseDone,
    phraseChallengeFailed,
    phraseChallengeState,
    refreshPhraseChallenge,
    canComplete:
      timerDone &&
      durationDone &&
      pageDone &&
      phraseDone &&
      linkedMediaDone &&
      !phraseChallengeFailed &&
      !linkedMediaFailed,
    openPage,
    finishRequirements,
  };
}
