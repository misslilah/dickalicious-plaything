import { useEffect, useState, type ReactNode } from 'react';
import type { Task } from '../types';
import { useTaskCompletion } from '../hooks/useTaskCompletion';
import { useAppStore } from '../hooks/useAppStore';
import { getPhraseRepeatCount } from '../lib/phraseChallenge';
import { taskHasRequirements } from '../lib/taskRequirements';
import { clearTimer, isTimerComplete } from '../lib/taskTimers';
import { PhraseChallengeModal } from './PhraseChallengeModal';

interface TaskCompletionGateProps {
  task: Task;
  completed: boolean;
  disabled?: boolean;
  variant?: 'list' | 'focus';
  onStart?: () => void;
  onComplete: () => void;
  onUncomplete?: () => void;
  children: ReactNode;
}

export function TaskCompletionGate({
  task,
  completed,
  disabled = false,
  variant = 'list',
  onStart,
  onComplete,
  onUncomplete,
  children,
}: TaskCompletionGateProps) {
  const { applyTaskMalus } = useAppStore();
  const [showPhraseModal, setShowPhraseModal] = useState(false);
  const [phraseFailNotice, setPhraseFailNotice] = useState<string | null>(null);
  const focusMode = variant === 'focus';

  const {
    hasTimer,
    hasDuration,
    hasPage,
    hasPhrase,
    countdown,
    durationCountdown,
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
    refreshPhraseChallenge,
    canComplete,
    openPage,
    finishRequirements,
  } = useTaskCompletion(task, completed);

  const hasRequirements = taskHasRequirements(task);
  const needsManualStart = hasTimer || hasDuration;
  const repeatCount = getPhraseRepeatCount(task);
  const malusOnFail = task.malusPointsOnFail ?? 0;

  useEffect(() => {
    if (!completed && !disabled && onStart && !needsManualStart) {
      onStart();
    }
  }, [task.id, completed, disabled, onStart, needsManualStart]);

  useEffect(() => {
    return () => {
      if (completed || !hasTimer) return;
      if (!isTimerComplete(task.id)) {
        clearTimer(task.id);
      }
    };
  }, [task.id, completed, hasTimer]);

  const handleStartTimer = () => {
    if (disabled || completed || timerStarted) return;
    startTaskTimer();
    onStart?.();
  };

  const handleStartDuration = () => {
    if (disabled || completed || durationStarted) return;
    startTaskDuration();
    onStart?.();
  };

  const openPhraseChallenge = () => {
    if (disabled || completed || phraseDone || phraseChallengeFailed) return;
    setShowPhraseModal(true);
  };

  const handleToggle = () => {
    if (completed) {
      onUncomplete?.();
      setPhraseFailNotice(null);
      return;
    }
    if (hasPhrase && !phraseDone && !phraseChallengeFailed) {
      openPhraseChallenge();
      return;
    }
    if (!canComplete || disabled) return;
    finishRequirements();
    onComplete();
  };

  const handleFinished = () => {
    if (completed || disabled || !canComplete) return;
    finishRequirements();
    onComplete();
  };

  const handlePhrasePassed = () => {
    refreshPhraseChallenge();
    setShowPhraseModal(false);
    setPhraseFailNotice(null);
  };

  const handlePhraseFailed = (malusPoints: number) => {
    applyTaskMalus(task.id);
    refreshPhraseChallenge();
    setShowPhraseModal(false);
    const malusText =
      malusPoints > 0
        ? `Phrase challenge failed. +${malusPoints} malus applied — this task cannot be completed today.`
        : 'Phrase challenge failed — this task cannot be completed today.';
    setPhraseFailNotice(malusText);
  };

  const checkboxDisabled =
    disabled || (!completed && hasRequirements && !canComplete);

  const requirementHints: string[] = [];
  if (!completed && hasRequirements) {
    if (hasTimer && !timerStarted) requirementHints.push('Start the timer');
    else if (hasTimer && timerRunning) requirementHints.push('Wait for the timer');
    if (hasDuration && !durationStarted) requirementHints.push('Start the duration');
    else if (hasDuration && durationRunning)
      requirementHints.push('Wait for the duration');
    if (hasPage && !pageOpened) requirementHints.push('Open the required page');
    if (hasPhrase && phraseChallengeFailed)
      requirementHints.push('Phrase challenge failed');
    else if (hasPhrase && !phraseDone) requirementHints.push('Complete the phrase challenge');
  }

  const gateContent = (
    <>
      {(phraseFailNotice || phraseChallengeFailed) && !completed && (
        <p className="task-card__phrase-fail" role="alert">
          {phraseFailNotice ??
            (malusOnFail > 0
              ? `Phrase challenge failed. +${malusOnFail} malus applied — this task cannot be completed today.`
              : 'Phrase challenge failed — this task cannot be completed today.')}
        </p>
      )}

      {hasRequirements && !completed && (
        <div className="task-gate">
          {hasTimer && (
            <div className="task-gate__block">
              <span className="task-gate__label">Timer</span>
              {!timerStarted ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={handleStartTimer}
                  disabled={disabled}
                >
                  Start timer
                </button>
              ) : timerDone ? (
                <span className="task-gate__ok">Ready</span>
              ) : (
                <>
                  <span className="task-gate__status">Timer running</span>
                  <span className="task-gate__countdown" aria-live="polite">
                    {countdown}
                  </span>
                </>
              )}
            </div>
          )}

          {hasDuration && (
            <div className="task-gate__block">
              <span className="task-gate__label">Duration</span>
              {!durationStarted ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={handleStartDuration}
                  disabled={disabled}
                >
                  Start duration
                </button>
              ) : durationDone ? (
                <span className="task-gate__ok">Ready</span>
              ) : (
                <>
                  <span className="task-gate__status">Duration running</span>
                  <span className="task-gate__countdown" aria-live="polite">
                    {durationCountdown}
                  </span>
                </>
              )}
            </div>
          )}

          {hasPage && (
            <div className="task-gate__block">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={openPage}
                disabled={disabled}
              >
                Open page
              </button>
              {pageOpened && <span className="task-gate__ok">Page opened</span>}
            </div>
          )}

          {hasPhrase && !phraseChallengeFailed && (
            <div className="task-gate__block">
              {phraseDone ? (
                <span className="task-gate__ok">
                  Phrase complete ({repeatCount}/{repeatCount})
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={openPhraseChallenge}
                  disabled={disabled}
                >
                  Begin phrase
                </button>
              )}
            </div>
          )}

          {requirementHints.length > 0 && (
            <p className="task-gate__hint muted">{requirementHints.join(' · ')}</p>
          )}
        </div>
      )}

      {focusMode && !completed && !disabled && (
        <div className="task-focus__actions">
          {canComplete ? (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={handleFinished}
            >
              Finished
            </button>
          ) : (
            <p className="task-focus__lock muted">
              {phraseChallengeFailed
                ? 'This task cannot be completed today.'
                : 'Complete all requirements above to finish.'}
            </p>
          )}
        </div>
      )}

      <PhraseChallengeModal
        task={task}
        open={showPhraseModal}
        onPassed={handlePhrasePassed}
        onFailed={handlePhraseFailed}
      />
    </>
  );

  if (focusMode) {
    return (
      <div className="task-gate task-gate--focus">
        {children}
        {gateContent}
      </div>
    );
  }

  return (
    <>
      <div className="task-card__shell">
        <input
          type="checkbox"
          checked={completed}
          disabled={checkboxDisabled}
          onChange={handleToggle}
          className="task-card__check"
          aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
        />
        {children}
      </div>
      {gateContent}
    </>
  );
}
