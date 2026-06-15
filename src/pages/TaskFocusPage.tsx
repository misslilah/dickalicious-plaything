import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { TaskAmbientMedia } from '../components/TaskAmbientMedia';
import { TaskCompletionGate } from '../components/TaskCompletionGate';
import { TaskMediaPlayer } from '../components/TaskMediaPlayer';
import { useAppStore } from '../hooks/useAppStore';
import { useTaskCompletion } from '../hooks/useTaskCompletion';
import { isCategoryImagePreview } from '../lib/categoryImage';
import {
  canJoinCategory,
  getCategoryTaskBlockReason,
  getCategoryUnlockBlockReason,
  isCategoryTaskAvailable,
  isCategoryUnlocked,
} from '../lib/categoryProgression';
import { isMalusBlockingTasks, MALUS_TASK_BLOCK_MESSAGE } from '../lib/malus';
import { getCategoryTaskStatus } from '../lib/gameLogic';
import {
  getRecurringTaskStatusLabel,
  isRecurringCategoryTask,
  isRecurringTaskAccepted,
  TASK_RECURRENCE_LABELS,
} from '../lib/recurringCategoryTasks';
import { isCategoryScopeTask } from '../lib/taskScope';
import {
  isTaskMediaAmbient,
  isTaskMediaAutoplayOnStart,
  isTaskMediaCompletionGated,
  isTaskMediaInline,
  taskHasUploadedMedia,
} from '../lib/taskMediaStorage';
import type { Task } from '../types';

const EMPTY_TASK: Task = {
  id: '',
  title: '',
  description: '',
  taskScope: 'category',
  frequency: 'daily',
  xpReward: 0,
};

export function TaskFocusPage() {
  const { categoryId, taskId } = useParams<{
    categoryId: string;
    taskId: string;
  }>();
  const navigate = useNavigate();
  const { state, markTaskStarted, completeTask, acceptRecurringCategoryTask, isEffectiveAdmin } = useAppStore();
  const [taskActive, setTaskActive] = useState(false);
  const [mediaFinished, setMediaFinished] = useState(false);

  const isAdmin = isEffectiveAdmin;
  const category = state.categories.find((c) => c.id === categoryId);
  const task = state.tasks.find((t) => t.id === taskId);
  const isMember =
    isAdmin ||
    (categoryId != null && state.joinedCategoryIds.includes(categoryId));

  const recurring = task != null && isRecurringCategoryTask(task);
  const accepted = !recurring || (taskId != null && isRecurringTaskAccepted(state, taskId));
  const recurrenceStatus =
    task && recurring ? getRecurringTaskStatusLabel(state, task) : null;
  const completed = taskId
    ? getCategoryTaskStatus(state, taskId) === 'done'
    : false;

  const validTask =
    task != null &&
    categoryId != null &&
    isCategoryScopeTask(task, categoryId);

  const { phraseChallengeFailed } = useTaskCompletion(task ?? EMPTY_TASK, completed);

  const allowNavigationRef = useRef(false);

  useEffect(() => {
    allowNavigationRef.current = false;
    setTaskActive(false);
  }, [taskId]);

  useEffect(() => {
    setMediaFinished(false);
  }, [taskId, taskActive]);

  const shouldBlockNavigation =
    validTask && isMember && accepted && taskActive && !completed && !phraseChallengeFailed;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNavigationRef.current &&
      shouldBlockNavigation &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!shouldBlockNavigation) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [shouldBlockNavigation]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const leave = window.confirm(
      'This task is in progress. Leave anyway? Your timer may reset.',
    );
    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  const handleStart = useCallback(() => {
    if (!taskId) return;
    setTaskActive(true);
    markTaskStarted(taskId);
  }, [taskId, markTaskStarted]);

  const handleFinished = useCallback(async () => {
    if (!taskId) return { ok: false as const, error: 'Task not found.' };
    const result = await completeTask(taskId);
    if (!result.ok) return result;
    allowNavigationRef.current = true;
    navigate(`/category/${categoryId}`, { replace: true });
    return { ok: true as const };
  }, [taskId, completeTask, navigate, categoryId]);

  if (!category || !task || !validTask) {
    return (
      <div className="page">
        <p className="muted">Task not found.</p>
        {categoryId && (
          <Link to={`/category/${categoryId}`} className="btn btn--ghost">
            Back to category
          </Link>
        )}
      </div>
    );
  }

  if (!isMember) {
    const locked = !isCategoryUnlocked(state, category);
    const joinGate = canJoinCategory(
      state,
      category,
      state.progress.currentLevel,
    );
    return (
      <div className="page">
        <p className="muted">Join this category to work on its tasks.</p>
        {locked && (
          <p className="login-error" role="alert">
            {getCategoryUnlockBlockReason(state, category)}
          </p>
        )}
        {!locked && !joinGate.ok && (
          <p className="login-error" role="alert">
            {joinGate.reason}
          </p>
        )}
        <Link to={`/category/${categoryId}`} className="btn btn--ghost">
          Back to category
        </Link>
      </div>
    );
  }

  if (
    !isAdmin &&
    categoryId &&
    !isCategoryTaskAvailable(state, task, categoryId) &&
    !completed
  ) {
    return (
      <div className="page">
        <p className="login-error" role="alert">
          {getCategoryTaskBlockReason(state, task, categoryId)}
        </p>
        <Link to={`/category/${categoryId}`} className="btn btn--ghost">
          Back to category
        </Link>
      </div>
    );
  }

  if (recurring && !isAdmin && !accepted) {
    return (
      <div className="page">
        <h2>{task.title}</h2>
        <p className="muted">
          This is a {task.recurrence ? TASK_RECURRENCE_LABELS[task.recurrence].toLowerCase() : ''}{' '}
          recurring task. Accept it to begin.
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void acceptRecurringCategoryTask(task.id)}
        >
          Accept task
        </button>
        <Link to={`/category/${categoryId}`} className="btn btn--ghost">
          Back to category
        </Link>
      </div>
    );
  }

  const imageUrl =
    category.imageUrl && isCategoryImagePreview(category.imageUrl)
      ? category.imageUrl
      : category.imageUrl?.startsWith('http')
        ? category.imageUrl
        : null;

  const canLeave = !shouldBlockNavigation;

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

  const malusBlocked =
    isMember &&
    !isAdmin &&
    !completed &&
    isMalusBlockingTasks(state.progress.malusPoints, isAdmin);

  return (
    <div className="page task-focus">
      {canLeave ? (
        <Link to={`/category/${categoryId}`} className="back-link">
          ← Back to {category.name}
        </Link>
      ) : (
        <span className="back-link back-link--disabled" aria-disabled>
          ← Complete this task to go back
        </span>
      )}

      <div className="task-focus__layout task-focus__layout--with-ambient">
        {showAmbientMedia && (
          <TaskAmbientMedia
            url={task.taskMediaUrl}
            mediaType={task.taskMediaType}
            playing={ambientPlaying}
            onEnded={() => setMediaFinished(true)}
          />
        )}

        <div className="task-focus__media">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="task-focus__image"
            />
          ) : (
            <div
              className="task-focus__placeholder"
              style={{ background: `${category.color}22` }}
            >
              <span className="task-focus__icon">{category.icon}</span>
            </div>
          )}
        </div>

        <div className="task-focus__panel">
          <header className="task-focus__header">
            <p className="task-focus__category muted">
              {category.icon} {category.name}
            </p>
            <h2 className="task-focus__title">{task.title}</h2>
            {recurring && task.recurrence && (
              <span className="tag tag--info">
                {TASK_RECURRENCE_LABELS[task.recurrence]}
              </span>
            )}
            {recurrenceStatus && (
              <p className="notice">{recurrenceStatus}</p>
            )}
            {task.description && (
              <p className="task-focus__desc">{task.description}</p>
            )}
            {showInlinePlayer && (
                <div className="task-focus__task-media">
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
              <p className="muted task-focus__ambient-hint">
                Background media will play when you start this task.
              </p>
            )}
          </header>

          {!completed && !taskActive && (
            <div className="task-focus__start">
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
            <TaskCompletionGate
              task={task}
              completed={completed}
              variant="focus"
              completionBlocked={mediaCompletionBlocked}
              completionBlockReason={mediaCompletionHint}
              onStart={() => taskId && markTaskStarted(taskId)}
              onComplete={handleFinished}
            >
              <div className="task-focus__rewards muted">
                +{task.xpReward} XP
                {(task.pointsReward ?? 0) > 0 && ` · +${task.pointsReward} pts`}
              </div>
            </TaskCompletionGate>
          )}

          {completed && (
            <p className="notice task-focus__done-notice">
              Task completed.{' '}
              <Link to={`/category/${categoryId}`}>Return to category</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
