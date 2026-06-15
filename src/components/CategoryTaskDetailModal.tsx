import { useCallback, useEffect, useState } from 'react';
import { TaskAmbientMedia } from './TaskAmbientMedia';
import { TaskCompletionGate } from './TaskCompletionGate';
import { TaskMediaPlayer } from './TaskMediaPlayer';
import { useAppStore } from '../hooks/useAppStore';
import { useTaskCompletion } from '../hooks/useTaskCompletion';
import { isCategoryImagePreview } from '../lib/categoryImage';
import {
  getCategoryTaskBlockReason,
  isCategoryTaskAvailable,
} from '../lib/categoryProgression';
import { isMalusBlockingTasks, MALUS_TASK_BLOCK_MESSAGE } from '../lib/malus';
import { getTaskPlanEntry } from '../lib/gameLogic';
import {
  getRecurringTaskStatusLabel,
  isRecurringCategoryTask,
  isRecurringTaskAccepted,
  TASK_RECURRENCE_LABELS,
} from '../lib/recurringCategoryTasks';
import {
  isTaskMediaAmbient,
  isTaskMediaAutoplayOnStart,
  isTaskMediaCompletionGated,
  isTaskMediaInline,
  taskHasUploadedMedia,
} from '../lib/taskMediaStorage';
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
  const [taskActive, setTaskActive] = useState(false);
  const [mediaFinished, setMediaFinished] = useState(false);

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
    open && isMember && accepted && taskActive && !completed && !phraseChallengeFailed;

  useEffect(() => {
    if (!open) setTaskActive(false);
  }, [open, task.id]);

  useEffect(() => {
    setMediaFinished(false);
  }, [task.id, taskActive]);

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

  const handleStart = useCallback(() => {
    setTaskActive(true);
    markTaskStarted(task.id);
  }, [task.id, markTaskStarted]);

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

  const malusBlocked =
    isMember &&
    !isAdmin &&
    !completed &&
    isMalusBlockingTasks(state.progress.malusPoints, isAdmin);

  const imageUrl =
    category.imageUrl && isCategoryImagePreview(category.imageUrl)
      ? category.imageUrl
      : category.imageUrl?.startsWith('http')
        ? category.imageUrl
        : null;

  const showAmbientMedia =
    taskActive &&
    isTaskMediaAmbient(task) &&
    isTaskMediaAutoplayOnStart(task) &&
    task.taskMediaUrl &&
    task.taskMediaType;

  const showAmbientHint =
    taskHasUploadedMedia(task) &&
    isTaskMediaAmbient(task) &&
    isTaskMediaAutoplayOnStart(task) &&
    !taskActive;

  const showInlinePlayer =
    taskHasUploadedMedia(task) &&
    task.taskMediaUrl &&
    task.taskMediaType &&
    !(isTaskMediaAmbient(task) && taskActive && isTaskMediaAutoplayOnStart(task)) &&
    !(isTaskMediaAmbient(task) && showAmbientHint);

  const ambientPlaying = Boolean(showAmbientMedia && !completed);
  const mediaCompletionGated = isTaskMediaCompletionGated(task, {
    taskActive,
    ambientPlaying,
  });
  const mediaCompletionBlocked = mediaCompletionGated && !mediaFinished;
  const mediaCompletionHint = 'Finish watching/listening before completing';

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
        {showAmbientMedia && (
          <TaskAmbientMedia
            url={task.taskMediaUrl}
            mediaType={task.taskMediaType}
            playing={ambientPlaying}
            onEnded={() => setMediaFinished(true)}
          />
        )}

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

                {showInlinePlayer && (
                    <div className="category-task-modal__task-media">
                      <TaskMediaPlayer
                        url={task.taskMediaUrl!}
                        mediaType={task.taskMediaType!}
                        autoPlay={
                          taskActive &&
                          isTaskMediaInline(task) &&
                          isTaskMediaAutoplayOnStart(task)
                        }
                        onEnded={
                          taskActive && mediaCompletionGated
                            ? () => setMediaFinished(true)
                            : undefined
                        }
                      />
                    </div>
                  )}

                {showAmbientHint && (
                  <p className="muted category-task-modal__ambient-hint">
                    Background media will play when you start this task.
                  </p>
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

              {!completed && !taskActive && (
                <div className="category-task-modal__start">
                  {malusBlocked ? (
                    <p className="login-error" role="alert">
                      {MALUS_TASK_BLOCK_MESSAGE}
                    </p>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--block"
                      onClick={handleStart}
                    >
                      Start
                    </button>
                  )}
                </div>
              )}

              {!completed && taskActive && (
                <div className="category-task-modal__actions">
                  <TaskCompletionGate
                    task={task}
                    completed={completed}
                    variant="focus"
                    completionBlocked={mediaCompletionBlocked}
                    completionBlockReason={mediaCompletionHint}
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
