import type { CSSProperties } from 'react';
import { TaskCard } from './TaskCard';
import { useAppStore } from '../hooks/useAppStore';
import {
  filterHomePlanEntries,
  getResetHour,
  getTodayPlan,
  homePlanCompletionStats,
} from '../lib/gameLogic';
import { isMalusBlockingTasks, MALUS_TASK_BLOCK_MESSAGE } from '../lib/malus';
import { formatDisplayDate, todayKey } from '../lib/dates';

export function DailyTasksSection() {
  const {
    state,
    session,
    completeTask,
    uncompleteTask,
    markTaskStarted,
    closeDay,
    isEffectiveAdmin,
  } = useAppStore();
  const userId = session?.userId ?? null;
  const plan = getTodayPlan(state);
  const homeEntries = plan
    ? filterHomePlanEntries(state, plan.tasks, userId)
    : [];
  const stats = homePlanCompletionStats(state, plan, userId);
  const dateKey = todayKey(getResetHour(state));
  const malusBlocked = isMalusBlockingTasks(
    state.progress.malusPoints,
    isEffectiveAdmin,
  );

  if (!plan) {
    return (
      <section className="card">
        <h2 className="section-title">Daily tasks</h2>
        <p className="muted">Loading plan…</p>
      </section>
    );
  }

  const earnedXp = homeEntries
    .filter((t) => t.completed)
    .reduce((sum, entry) => {
      const task = state.tasks.find((x) => x.id === entry.taskId);
      return sum + (task?.xpReward ?? 0);
    }, 0);

  return (
    <section className="card daily-tasks">
      <header className="daily-tasks__header">
        <div>
          <h2 className="section-title">Daily tasks</h2>
          <p className="muted">{formatDisplayDate(dateKey)}</p>
        </div>
        {homeEntries.length > 0 && (
          <div
            className="progress-ring progress-ring--sm"
            style={{ '--p': stats.percent } as CSSProperties}
          >
            <span className="progress-ring__value">{stats.percent}%</span>
          </div>
        )}
      </header>

      {homeEntries.length > 0 && (
        <p className="daily-tasks__summary muted">
          <strong>{stats.completed}</strong> / {stats.total} done · +{earnedXp} XP today
        </p>
      )}

      {malusBlocked && (
        <p className="login-error" role="alert">
          {MALUS_TASK_BLOCK_MESSAGE}
        </p>
      )}

      <ul className="task-list">
        {homeEntries.map((entry) => {
          const task = state.tasks.find((t) => t.id === entry.taskId);
          if (!task) return null;
          const category = task.categoryId
            ? state.categories.find((c) => c.id === task.categoryId)
            : undefined;
          const isPersonal = (task.taskScope ?? 'category') === 'custom';
          return (
            <li key={entry.taskId}>
              <TaskCard
                task={task}
                category={category}
                scopeBadge={isPersonal ? 'Personal' : undefined}
                completed={entry.completed}
                disabled={plan.closed || malusBlocked}
                onStart={() => markTaskStarted(entry.taskId)}
                onComplete={() => completeTask(entry.taskId)}
                onUncomplete={() => uncompleteTask(entry.taskId)}
              />
            </li>
          );
        })}
      </ul>

      {homeEntries.length === 0 && (
        <p className="muted">
          {state.tasks.length === 0
            ? 'No tasks configured yet. Ask an admin to add daily or personal tasks.'
            : 'No daily or personal tasks match your level today. Browse categories below or ask an admin.'}
        </p>
      )}

      {!plan.closed && homeEntries.length > 0 && (
        <button type="button" className="btn btn--primary btn--block" onClick={closeDay}>
          Close the day
        </button>
      )}

      {plan.closed && (
        <p className="notice">
          {stats.percent === 100
            ? 'Well done! All tasks completed for today.'
            : 'Day closed — incomplete tasks may have added malus. Check Punishments.'}
        </p>
      )}
    </section>
  );
}
