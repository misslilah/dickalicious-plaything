import { Link } from 'react-router-dom';
import { getStageLabel } from '../lib/levels';
import type { CategoryTaskStatus } from '../lib/gameLogic';
import type { Task } from '../types';

const STATUS_LABELS: Record<CategoryTaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

const frequencyLabels: Record<Task['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  once: 'One-time',
};

interface TaskListRowProps {
  task: Task;
  categoryId: string;
  status: CategoryTaskStatus;
  disabled?: boolean;
  dailyLimitBlocked?: boolean;
  dailyLimitMessage?: string;
}

export function TaskListRow({
  task,
  categoryId,
  status,
  disabled = false,
  dailyLimitBlocked = false,
  dailyLimitMessage,
}: TaskListRowProps) {
  const to = `/category/${categoryId}/task/${task.id}`;

  if (dailyLimitBlocked && status !== 'done') {
    return (
      <button
        type="button"
        className={`task-list-row task-list-row--${status} task-list-row--disabled`}
        onClick={() => {
          if (dailyLimitMessage) window.alert(dailyLimitMessage);
        }}
        aria-label={`${task.title} — category task limit reached`}
      >
        <TaskListRowContent task={task} status={status} />
      </button>
    );
  }

  if (disabled) {
    return (
      <div
        className={`task-list-row task-list-row--${status} task-list-row--disabled`}
        aria-disabled
      >
        <TaskListRowContent task={task} status={status} />
      </div>
    );
  }

  return (
    <Link
      to={to}
      className={`task-list-row task-list-row--${status}`}
      aria-label={`${task.title} — ${STATUS_LABELS[status]}`}
    >
      <TaskListRowContent task={task} status={status} />
    </Link>
  );
}

function TaskListRowContent({
  task,
  status,
}: {
  task: Task;
  status: CategoryTaskStatus;
}) {
  return (
    <>
      <div className="task-list-row__main">
        <h3 className="task-list-row__title">{task.title}</h3>
        {task.description && (
          <p className="task-list-row__desc">{task.description}</p>
        )}
        <div className="task-list-row__meta">
          <span>{frequencyLabels[task.frequency]}</span>
          {task.userStage && task.userStage !== 'any' && (
            <span>{getStageLabel(task.userStage)}</span>
          )}
          <span className="task-list-row__xp">+{task.xpReward} XP</span>
          {(task.pointsReward ?? 0) > 0 && (
            <span className="task-list-row__xp">+{task.pointsReward} pts</span>
          )}
        </div>
      </div>
      <div className="task-list-row__aside">
        <span className={`task-list-row__status task-list-row__status--${status}`}>
          {STATUS_LABELS[status]}
        </span>
        <span className="task-list-row__chevron" aria-hidden>
          →
        </span>
      </div>
    </>
  );
}
