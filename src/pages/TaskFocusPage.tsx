import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { TaskCompletionGate } from '../components/TaskCompletionGate';
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
import { getTaskPlanEntry } from '../lib/gameLogic';
import { isCategoryScopeTask } from '../lib/taskScope';
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
  const { state, session, markTaskStarted, completeTask } = useAppStore();

  const isAdmin = session?.role === 'admin';
  const category = state.categories.find((c) => c.id === categoryId);
  const task = state.tasks.find((t) => t.id === taskId);
  const isMember =
    isAdmin ||
    (categoryId != null && state.joinedCategoryIds.includes(categoryId));

  const planEntry = useMemo(
    () => (taskId ? getTaskPlanEntry(state, taskId) : undefined),
    [state, taskId],
  );
  const completed = planEntry?.completed ?? false;

  const validTask =
    task != null &&
    categoryId != null &&
    isCategoryScopeTask(task, categoryId);

  const { phraseChallengeFailed } = useTaskCompletion(task ?? EMPTY_TASK, completed);

  const allowNavigationRef = useRef(false);

  useEffect(() => {
    allowNavigationRef.current = false;
  }, [taskId]);

  useEffect(() => {
    if (!taskId || !validTask || completed) return;
    markTaskStarted(taskId);
  }, [taskId, validTask, completed, markTaskStarted]);

  const shouldBlockNavigation =
    validTask && isMember && !completed && !phraseChallengeFailed;

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

  const imageUrl =
    category.imageUrl && isCategoryImagePreview(category.imageUrl)
      ? category.imageUrl
      : category.imageUrl?.startsWith('http')
        ? category.imageUrl
        : null;

  const canLeave = !shouldBlockNavigation;

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

      <div className="task-focus__layout">
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
            {task.description && (
              <p className="task-focus__desc">{task.description}</p>
            )}
          </header>

          <TaskCompletionGate
            task={task}
            completed={completed}
            variant="focus"
            onStart={() => taskId && markTaskStarted(taskId)}
            onComplete={handleFinished}
          >
            <div className="task-focus__rewards muted">
              +{task.xpReward} XP
              {(task.pointsReward ?? 0) > 0 && ` · +${task.pointsReward} pts`}
            </div>
          </TaskCompletionGate>

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
