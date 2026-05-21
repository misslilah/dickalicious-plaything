import type { ReactNode } from 'react';
import type { Task } from '../types';
import { useTaskCompletion } from '../hooks/useTaskCompletion';
import { taskHasRequirements } from '../lib/taskRequirements';

interface TaskCompletionGateProps {
  task: Task;
  completed: boolean;
  disabled?: boolean;
  onComplete: () => void;
  onUncomplete?: () => void;
  children: ReactNode;
}

export function TaskCompletionGate({
  task,
  completed,
  disabled = false,
  onComplete,
  onUncomplete,
  children,
}: TaskCompletionGateProps) {
  const {
    hasTimer,
    hasPage,
    hasPhrase,
    countdown,
    timerDone,
    pageOpened,
    phraseInput,
    setPhraseInput,
    phraseDone,
    canComplete,
    openPage,
    finishRequirements,
  } = useTaskCompletion(task, completed);

  const hasRequirements = taskHasRequirements(task);

  const handleToggle = () => {
    if (completed) {
      onUncomplete?.();
      return;
    }
    if (!canComplete || disabled) return;
    finishRequirements();
    onComplete();
  };

  const checkboxDisabled =
    disabled || (!completed && hasRequirements && !canComplete);

  const requirementHints: string[] = [];
  if (!completed && hasRequirements) {
    if (hasTimer && !timerDone) requirementHints.push('Wait for the timer');
    if (hasPage && !pageOpened) requirementHints.push('Open the required page');
    if (hasPhrase && !phraseDone) requirementHints.push('Type the exact phrase');
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

      {hasRequirements && !completed && (
        <div className="task-gate">
          {hasTimer && (
            <div className="task-gate__block">
              <span className="task-gate__label">Timer</span>
              {timerDone ? (
                <span className="task-gate__ok">Ready</span>
              ) : (
                <span className="task-gate__countdown" aria-live="polite">
                  {countdown}
                </span>
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

          {hasPhrase && (
            <div className="task-gate__block task-gate__phrase">
              <label className="task-gate__label" htmlFor={`phrase-${task.id}`}>
                Type:{' '}
                <span className="task-gate__phrase-hint">{task.requiredPhrase}</span>
              </label>
              <input
                id={`phrase-${task.id}`}
                type="text"
                className="task-gate__input"
                value={phraseInput}
                onChange={(e) => setPhraseInput(e.target.value)}
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                placeholder="Type the phrase exactly"
              />
            </div>
          )}

          {requirementHints.length > 0 && (
            <p className="task-gate__hint muted">{requirementHints.join(' · ')}</p>
          )}
        </div>
      )}
    </>
  );
}
