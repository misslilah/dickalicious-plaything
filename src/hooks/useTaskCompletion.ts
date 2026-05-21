import { useCallback, useEffect, useState } from 'react';
import type { Task } from '../types';
import { markPageOpened, isPageOpened } from '../lib/taskPageOpened';
import {
  formatCountdown,
  getRemainingMs,
  hasActiveTimer,
  isTimerComplete,
  startTimer,
  clearTimer,
} from '../lib/taskTimers';
import {
  phraseMatches,
  taskHasOpenUrl,
  taskHasPhrase,
  taskHasTimer,
} from '../lib/taskRequirements';

export function useTaskCompletion(task: Task, completed: boolean) {
  const hasTimer = taskHasTimer(task);
  const hasPage = taskHasOpenUrl(task);
  const hasPhrase = taskHasPhrase(task);

  const [remainingMs, setRemainingMs] = useState(() =>
    hasTimer ? getRemainingMs(task.id) : 0,
  );
  const [pageOpened, setPageOpened] = useState(() =>
    hasPage ? isPageOpened(task.id) : true,
  );
  const [phraseInput, setPhraseInput] = useState('');

  const tick = useCallback(() => {
    if (!hasTimer) return;
    setRemainingMs(getRemainingMs(task.id));
  }, [hasTimer, task.id]);

  useEffect(() => {
    if (!hasTimer || completed) return;
    if (!hasActiveTimer(task.id) && !isTimerComplete(task.id)) {
      startTimer(task.id, task.timerSeconds!);
    }
    tick();
  }, [hasTimer, completed, task.id, task.timerSeconds, tick]);

  useEffect(() => {
    if (!hasTimer || completed) return;
    const id = window.setInterval(tick, 1000);
    const onVisible = () => tick();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [hasTimer, completed, tick]);

  const timerDone = !hasTimer || isTimerComplete(task.id);
  const pageDone = !hasPage || pageOpened;
  const phraseDone =
    !hasPhrase || phraseMatches(phraseInput, task.requiredPhrase!);

  const openPage = () => {
    const url = task.openUrl?.trim();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    markPageOpened(task.id);
    setPageOpened(true);
  };

  const finishRequirements = () => {
    if (hasTimer) clearTimer(task.id);
  };

  return {
    hasTimer,
    hasPage,
    hasPhrase,
    remainingMs,
    countdown: formatCountdown(remainingMs),
    timerDone,
    pageOpened,
    phraseInput,
    setPhraseInput,
    phraseDone,
    canComplete: timerDone && pageDone && phraseDone,
    openPage,
    finishRequirements,
  };
}
