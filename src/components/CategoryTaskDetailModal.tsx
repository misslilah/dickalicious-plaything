import { useCallback, useEffect, useState } from 'react';
import { TaskCompletionGate } from './TaskCompletionGate';
import { TaskMediaPlayer } from './TaskMediaPlayer';
import { useAppStore } from '../hooks/useAppStore';
import { useTaskCompletion } from '../hooks/useTaskCompletion';
import { isCategoryImagePreview } from '../lib/categoryImage';
import {
  getCategoryTaskBlockReason,
  isCategoryTaskAvailable,
} from '../lib/categoryProgression';
import { getTaskPlanEntry } from '../lib/gameLogic';
import {
  getRecurringTaskStatusLabel,
  isRecurringCategoryTask,
  isRecurringTaskAccepted,
  TASK_RECURRENCE_LABELS,
} from '../lib/recurringCategoryTasks';
import { taskHasUploadedMedia } from '../lib/taskMediaStorage';
import type { Category, Task } from '../types';

interface CategoryTaskDetailModalProps {
  open: boolean;
  task: Task;
  category: Category;
  categoryId: string;
  isAdmin: boolean;
  isMember: boolean;
  onClose: () => void;
}

export function CategoryTaskDetailModal({
  open,
  task,
  category,
  categoryId,
  isAdmin,
  isMember,
  onClose,
}: CategoryTaskDetailModalProps) {
  const { state, markTaskStarted, completeTask, acceptRecurringCategoryTask } =
    useAppStore();
  const [acceptError, setAcceptError] = useState('');
  const [accepting, setAccepting] = useState(false);

  const recurring = isRecurringCategoryTask(task);
  const accepted = !recurring || isRecurringTaskAccepted(state, task.id);
  const recurrenceLabel =
    recurring && task.recurrence
      ? TASK_RECURRENCE_LABELS[task.recurrence]
      : null;
  const recurrenceStatus = recurring
    ? getRecurringTaskStatusLabel(state, task)
    : null;

  const planEntry = getTaskPlanEntry(state, task.id);
  const completedToday = planEntry?.completed ?? false;
  const completed = recurring
    ? recurrenceStatus?.includes('✓') ?? false
    : completedToday;

  const { phraseChallengeFailed } = useTaskCompletion(task, completed);

  const shouldConfirmClose =
    open && isMember && accepted && !completed && !phraseChallengeFailed;

  useEffect(() => {
    if (!open || !isMember || !accepted || completed) return;
    markTaskStarted(task.id);
  }, [open, task.id, isMember, accepted, completed, markTaskStarted]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const requestClose = useCallback(() => {
    if (shouldConfirmClose) {
      const leave = window.confirm(
        'This task is in progress. Close anyway? Your timer may reset.',
      );
      if (!leave) return;
    }
    onClose();
  }, [shouldConfirmClose, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, requestClose]);

  const handleFinished = useCallback(async () => {
    const result = await completeTask(task.id);
    if (!result.ok) return result;
    onClose();
    return { ok: true as const };
  }, [task.id, completeTask, onClose]);

  const handleAccept = useCallback(async () => {
    setAcceptError('');
    setAccepting(true);
    const result = await acceptRecurringCategoryTask(task.id);
    setAccepting(false);
    if (!result.ok) {
      setAcceptError(result.error);
      return;
    }
  }, [task.id, acceptRecurringCategoryTask]);

  if (!open) return null;

  const prerequisiteBlocked =
    !isAdmin &&
    !isCategoryTaskAvailable(state, task, categoryId) &&
    !completed;

  const needsAccept = recurring && isMember && !isAdmin && !accepted;

  const imageUrl =
    category.imageUrl && isCategoryImagePreview(category.imageUrl)
      ? category.imageUrl
      : category.imageUrl?.startsWith('http')
        ? category.imageUrl
        : null;

  return (
    <div
      className="category-task-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-task-modal-title"
    >
      <button
        type="button"
        className="category-task-modal__backdrop"
        aria-label="Close task"
        onClick={requestClose}
      />
      <div className="category-task-modal__panel">
        <header className="category-task-modal__header">
          <div className="category-task-modal__heading">
            <p className="muted category-task-modal__category">
              {category.icon} {category.name}
            </p>
            <h2 id="category-task-modal-title">{task.title}</h2>
            {task.isExamTask && (
              <span className="tag tag--warn">Exam</span>
            )}
            {recurrenceLabel && (
              <span className="tag tag--info">{recurrenceLabel}</span>
            )}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--small category-task-modal__close"
            onClick={requestClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="category-task-modal__body">
          {prerequisiteBlocked ? (
            <p className="login-error" role="alert">
              {getCategoryTaskBlockReason(state, task, categoryId)}
            </p>
          ) : needsAccept ? (
            <div className="category-task-modal__layout">
              <div className="category-task-modal__info">
                {task.description && (
                  <p className="category-task-modal__desc">{task.description}</p>
                )}
                <p className="muted">
                  This is a {recurrenceLabel?.toLowerCase()} recurring task. Accept it
                  to add it to your obligations until this category is fully
                  completed.
                </p>
                {acceptError && (
                  <p className="login-error" role="alert">
                    {acceptError}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={accepting}
                  onClick={() => void handleAccept()}
                >
                  {accepting ? 'Accepting…' : 'Accept task'}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`category-task-modal__layout${completed ? ' category-task-modal__layout--completed' : ''}`}
            >
              <div className="category-task-modal__info">
                <div className="category-task-modal__media">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="category-task-modal__image"
                    />
                  ) : (
                    <div
                      className="category-task-modal__placeholder"
                      style={{ background: `${category.color}22` }}
                    >
                      <span className="category-task-modal__icon">{category.icon}</span>
                    </div>
                  )}
                </div>

                {task.description && (
                  <p className="category-task-modal__desc">{task.description}</p>
                )}

                {taskHasUploadedMedia(task) && task.taskMediaUrl && task.taskMediaType && (
                  <div className="category-task-modal__task-media">
                    <TaskMediaPlayer
                      url={task.taskMediaUrl}
                      mediaType={task.taskMediaType}
                    />
                  </div>
                )}

                {recurrenceStatus && (
                  <p className="notice category-task-modal__recurrence">
                    {recurrenceStatus}
                  </p>
                )}

                <div className="category-task-modal__rewards muted">
                  +{task.xpReward} XP
                  {(task.pointsReward ?? 0) > 0 && ` · +${task.pointsReward} pts`}
                </div>

                {completed && (
                  <p className="notice category-task-modal__done">Task completed.</p>
                )}
              </div>

              {!completed && (
                <div className="category-task-modal__actions">
                  <TaskCompletionGate
                    task={task}
                    completed={completed}
                    variant="focus"
                    onStart={() => markTaskStarted(task.id)}
                    onComplete={handleFinished}
                  >
                    {null}
                  </TaskCompletionGate>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
