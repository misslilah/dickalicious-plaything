import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Task } from '../types';
import { useTaskCompletion } from '../hooks/useTaskCompletion';
import { useAppStore } from '../hooks/useAppStore';
import { dailyTaskCompletionBlockedMessage } from '../lib/dailyTaskCompletions';
import { countsTowardDailyCompletionLimit } from '../lib/taskScope';
import { getPhraseRepeatCount } from '../lib/phraseChallenge';
import {
  markLinkedMediaComplete,
  markLinkedMediaFailed,
} from '../lib/taskLinkedMedia';
import { taskHasRequirements } from '../lib/taskRequirements';
import { clearTimer, isTimerComplete } from '../lib/taskTimers';
import { clearDuration } from '../lib/taskDuration';
import { PhraseChallengeModal } from './PhraseChallengeModal';
import { TaskLinkedMediaModal } from './TaskLinkedMediaModal';

export type TaskCompleteResult = { ok: true } | { ok: false; error: string };

interface TaskCompletionGateProps {
  task: Task;
  completed: boolean;
  disabled?: boolean;
  variant?: 'list' | 'focus';
  onStart?: () => void;
  onComplete: () => TaskCompleteResult | Promise<TaskCompleteResult>;
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
  const {
    applyTaskMalus,
    recordBadgeTaskTime,
    dailyTaskCompletionStatus,
    isEffectiveAdmin,
  } = useAppStore();
  const [showPhraseModal, setShowPhraseModal] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [phraseFailNotice, setPhraseFailNotice] = useState<string | null>(null);
  const [mediaFailNotice, setMediaFailNotice] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const isAdmin = isEffectiveAdmin;
  const enforceDailyLimit = countsTowardDailyCompletionLimit(task);
  const atDailyLimit =
    enforceDailyLimit &&
    !completed &&
    !isAdmin &&
    dailyTaskCompletionStatus != null &&
    !dailyTaskCompletionStatus.unlimited &&
    !dailyTaskCompletionStatus.canComplete;
  const focusMode = variant === 'focus';
  const timerCreditedRef = useRef(false);
  const durationCreditedRef = useRef(false);

  const {
    hasTimer,
    hasDuration,
    hasPage,
    hasPhrase,
    hasLinkedMedia,
    linkedMediaDone,
    linkedMediaFailed,
    refreshLinkedMedia,
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
  const needsManualStart = hasTimer || hasDuration || hasLinkedMedia;
  const repeatCount = getPhraseRepeatCount(task);
  const malusOnFail = task.malusPointsOnFail ?? 0;

  useEffect(() => {
    timerCreditedRef.current = false;
    durationCreditedRef.current = false;
    setCompletionError(null);
  }, [task.id]);

  const runComplete = async () => {
    if (completed || disabled || completing || atDailyLimit) return;
    setCompletionError(null);
    setCompleting(true);
    const result = await Promise.resolve(onComplete());
    setCompleting(false);
    if (!result.ok) {
      setCompletionError(result.error);
      return;
    }
    finishRequirements();
  };

  useEffect(() => {
    if (
      !completed &&
      timerDone &&
      hasTimer &&
      task.timerSeconds &&
      !timerCreditedRef.current
    ) {
      timerCreditedRef.current = true;
      recordBadgeTaskTime(task.id, task.timerSeconds);
    }
  }, [
    completed,
    timerDone,
    hasTimer,
    task.id,
    task.timerSeconds,
    recordBadgeTaskTime,
  ]);

  useEffect(() => {
    if (
      !completed &&
      durationDone &&
      hasDuration &&
      task.durationSeconds &&
      !durationCreditedRef.current
    ) {
      durationCreditedRef.current = true;
      recordBadgeTaskTime(task.id, task.durationSeconds);
    }
  }, [
    completed,
    durationDone,
    hasDuration,
    task.id,
    task.durationSeconds,
    recordBadgeTaskTime,
  ]);

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

  const openLinkedMedia = () => {
    if (
      disabled ||
      completed ||
      linkedMediaDone ||
      linkedMediaFailed ||
      phraseChallengeFailed
    ) {
      return;
    }
    setShowMediaModal(true);
    onStart?.();
  };

  const resetTaskProgressOnMediaFail = () => {
    if (hasTimer) clearTimer(task.id);
    if (hasDuration) clearDuration(task.id);
  };

  const handleToggle = () => {
    if (completed) {
      onUncomplete?.();
      setPhraseFailNotice(null);
      return;
    }
    if (atDailyLimit) {
      setCompletionError(
        dailyTaskCompletionStatus
          ? dailyTaskCompletionBlockedMessage(dailyTaskCompletionStatus)
          : 'Category task limit reached (3/3). Come back tomorrow.',
      );
      return;
    }
    if (hasPhrase && !phraseDone && !phraseChallengeFailed) {
      openPhraseChallenge();
      return;
    }
    if (!canComplete || disabled || completing) return;
    void runComplete();
  };

  const handleFinished = () => {
    if (completed || disabled || !canComplete || completing || atDailyLimit) return;
    void runComplete();
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

  const handleMediaClose = (reason: 'completed' | 'failed' | 'dismissed') => {
    setShowMediaModal(false);
    if (reason === 'dismissed') return;
    if (reason === 'completed') {
      markLinkedMediaComplete(task.id);
      refreshLinkedMedia();
      setMediaFailNotice(null);
      return;
    }
    applyTaskMalus(task.id);
    markLinkedMediaFailed(task.id);
    resetTaskProgressOnMediaFail();
    refreshLinkedMedia();
    const malusText =
      malusOnFail > 0
        ? `Media not finished. +${malusOnFail} malus applied — this task cannot be completed today.`
        : 'Media not finished — this task cannot be completed today.';
    setMediaFailNotice(malusText);
  };

  const checkboxDisabled =
    disabled ||
    completing ||
    atDailyLimit ||
    (!completed && hasRequirements && !canComplete);

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
    if (hasLinkedMedia && linkedMediaFailed)
      requirementHints.push('Linked media failed');
    else if (hasLinkedMedia && !linkedMediaDone)
      requirementHints.push('Watch or listen to linked media');
  }

  const gateContent = (
    <>
      {(completionError || atDailyLimit) && !completed && (
        <p className="task-card__phrase-fail" role="alert">
          {completionError ??
            (dailyTaskCompletionStatus
              ? dailyTaskCompletionBlockedMessage(dailyTaskCompletionStatus)
              : 'Category task limit reached (3/3). Come back tomorrow.')}
        </p>
      )}

      {(phraseFailNotice || phraseChallengeFailed) && !completed && (
        <p className="task-card__phrase-fail" role="alert">
          {phraseFailNotice ??
            (malusOnFail > 0
              ? `Phrase challenge failed. +${malusOnFail} malus applied — this task cannot be completed today.`
              : 'Phrase challenge failed — this task cannot be completed today.')}
        </p>
      )}

      {(mediaFailNotice || linkedMediaFailed) && !completed && (
        <p className="task-card__phrase-fail" role="alert">
          {mediaFailNotice ??
            (malusOnFail > 0
              ? `Media not finished. +${malusOnFail} malus applied — this task cannot be completed today.`
              : 'Media not finished — this task cannot be completed today.')}
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

          {hasLinkedMedia && !linkedMediaFailed && (
            <div className="task-gate__block">
              <span className="task-gate__label">
                {task.linkedMediaType === 'video' ? 'Video' : 'Audio'}
              </span>
              {linkedMediaDone ? (
                <span className="task-gate__ok">Finished</span>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={openLinkedMedia}
                  disabled={disabled}
                >
                  Start
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
          {atDailyLimit ? (
            <p className="task-focus__lock login-error" role="alert">
              {dailyTaskCompletionStatus
                ? dailyTaskCompletionBlockedMessage(dailyTaskCompletionStatus)
                : 'Category task limit reached (3/3). Come back tomorrow.'}
            </p>
          ) : canComplete ? (
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={handleFinished}
              disabled={completing}
            >
              {completing ? 'Saving…' : 'Finished'}
            </button>
          ) : (
            <p className="task-focus__lock muted">
              {phraseChallengeFailed || linkedMediaFailed
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

      <TaskLinkedMediaModal
        task={task}
        open={showMediaModal}
        onClose={handleMediaClose}
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
