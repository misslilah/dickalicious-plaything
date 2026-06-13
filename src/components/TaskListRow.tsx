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
  locked?: boolean;
  lockReason?: string | null;
  dailyLimitBlocked?: boolean;
  dailyLimitMessage?: string;
  onOpen?: () => void;
}

export function TaskListRow({
  task,
  categoryId,
  status,
  disabled = false,
  locked = false,
  lockReason,
  dailyLimitBlocked = false,
  dailyLimitMessage,
  onOpen,
}: TaskListRowProps) {
  const to = `/category/${categoryId}/task/${task.id}`;
  const isBlocked = locked || dailyLimitBlocked;

  if (isBlocked && status !== 'done') {
    const message =
      lockReason ??
      (dailyLimitBlocked ? dailyLimitMessage : 'This task is locked.');
    return (
      <button
        type="button"
        className={`task-list-row task-list-row--${status} task-list-row--disabled task-list-row--locked`}
        onClick={() => {
          if (message) window.alert(message);
        }}
        aria-label={`${task.title} — locked`}
      >
        <TaskListRowContent task={task} status={status} locked lockReason={message} />
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

  if (onOpen) {
    return (
      <button
        type="button"
        className={`task-list-row task-list-row--${status}`}
        onClick={onOpen}
        aria-label={`${task.title} — ${STATUS_LABELS[status]}`}
      >
        <TaskListRowContent task={task} status={status} />
      </button>
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
  locked = false,
  lockReason,
}: {
  task: Task;
  status: CategoryTaskStatus;
  locked?: boolean;
  lockReason?: string | null;
}) {
  return (
    <>
      <div className="task-list-row__main">
        <h3 className="task-list-row__title">
          {locked && <span aria-hidden>🔒 </span>}
          {task.title}
          {task.isExamTask && (
            <span className="tag tag--warn task-list-row__exam">Exam</span>
          )}
        </h3>
        {task.description && (
          <p className="task-list-row__desc">{task.description}</p>
        )}
        {locked && lockReason && (
          <p className="task-list-row__lock-reason muted">{lockReason}</p>
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
          {locked && status !== 'done' ? 'Locked' : STATUS_LABELS[status]}
        </span>
        {!locked && (
          <span className="task-list-row__chevron" aria-hidden>
            →
          </span>
        )}
      </div>
    </>
  );
}
