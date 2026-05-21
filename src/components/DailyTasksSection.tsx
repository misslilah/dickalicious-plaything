import type { CSSProperties } from 'react';
import { TaskCard } from './TaskCard';
import { useAppStore } from '../hooks/useAppStore';
import { completionStats, getTodayPlan } from '../lib/gameLogic';
import { formatDisplayDate, todayKey } from '../lib/dates';

export function DailyTasksSection() {
  const { state, completeTask, uncompleteTask, closeDay } = useAppStore();
  const plan = getTodayPlan(state);
  const stats = completionStats(plan);
  const dateKey = todayKey(state.settings.resetHour);

  if (!plan) {
    return (
      <section className="card">
        <h2 className="section-title">Daily tasks</h2>
        <p className="muted">Loading plan…</p>
      </section>
    );
  }

  const earnedXp = plan.tasks
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
        {plan.tasks.length > 0 && (
          <div
            className="progress-ring progress-ring--sm"
            style={{ '--p': stats.percent } as CSSProperties}
          >
            <span className="progress-ring__value">{stats.percent}%</span>
          </div>
        )}
      </header>

      {plan.tasks.length > 0 && (
        <p className="daily-tasks__summary muted">
          <strong>{stats.completed}</strong> / {stats.total} done · +{earnedXp} XP today
        </p>
      )}

      <ul className="task-list">
        {plan.tasks.map((entry) => {
          const task = state.tasks.find((t) => t.id === entry.taskId);
          if (!task) return null;
          const category = state.categories.find((c) => c.id === task.categoryId);
          return (
            <li key={entry.taskId}>
              <TaskCard
                task={task}
                category={category}
                completed={entry.completed}
                disabled={plan.closed}
                onToggle={() =>
                  entry.completed
                    ? uncompleteTask(entry.taskId)
                    : completeTask(entry.taskId)
                }
              />
            </li>
          );
        })}
      </ul>

      {plan.tasks.length === 0 && (
        <p className="muted">
          {state.tasks.length === 0
            ? 'No tasks configured yet. Ask an admin to create categories and daily tasks.'
            : 'No daily tasks match your current level. Browse categories below or ask an admin to add tasks.'}
        </p>
      )}

      {!plan.closed && plan.tasks.length > 0 && (
        <button type="button" className="btn btn--primary btn--block" onClick={closeDay}>
          Close the day
        </button>
      )}

      {plan.closed && (
        <p className="notice">
          {stats.percent >= state.settings.dailyQuotaPercent
            ? 'Well done! Quota reached for today.'
            : 'Day closed without quota — punishments may apply.'}
        </p>
      )}
    </section>
  );
}
