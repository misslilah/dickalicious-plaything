import { Link } from 'react-router-dom';
import { getStageLabel } from '../lib/levels';
import type { CategoryTaskStatus } from '../lib/gameLogic';
import { TASK_RECURRENCE_LABELS } from '../lib/recurringCategoryTasks';
import type { Task, TaskRecurrence } from '../types';

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
  pendingAccept?: boolean;
  recurrenceStatus?: string | null;
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
  pendingAccept = false,
  recurrenceStatus,
  onOpen,
}: TaskListRowProps) {
  const to = `/category/${categoryId}/task/${task.id}`;
  const isBlocked = locked || dailyLimitBlocked;
  const displayStatus = pendingAccept ? 'not_started' : status;
  const statusLabel = pendingAccept
    ? 'Accept'
    : locked && status !== 'done'
      ? 'Locked'
      : STATUS_LABELS[displayStatus];

  if (isBlocked && status !== 'done' && !pendingAccept) {
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
        <TaskListRowContent
          task={task}
          status={status}
          locked
          lockReason={message}
          recurrenceStatus={recurrenceStatus}
        />
      </button>
    );
  }

  if (disabled) {
    return (
      <div
        className={`task-list-row task-list-row--${status} task-list-row--disabled`}
        aria-disabled
      >
        <TaskListRowContent
          task={task}
          status={status}
          recurrenceStatus={recurrenceStatus}
          pendingAccept={pendingAccept}
        />
      </div>
    );
  }

  if (onOpen) {
    return (
      <button
        type="button"
        className={`task-list-row task-list-row--${displayStatus}${pendingAccept ? ' task-list-row--pending-accept' : ''}`}
        onClick={onOpen}
        aria-label={`${task.title} — ${statusLabel}`}
      >
        <TaskListRowContent
          task={task}
          status={displayStatus}
          recurrenceStatus={recurrenceStatus}
          pendingAccept={pendingAccept}
        />
      </button>
    );
  }

  return (
    <Link
      to={to}
      className={`task-list-row task-list-row--${displayStatus}`}
      aria-label={`${task.title} — ${statusLabel}`}
    >
      <TaskListRowContent
        task={task}
        status={displayStatus}
        recurrenceStatus={recurrenceStatus}
        pendingAccept={pendingAccept}
      />
    </Link>
  );
}

function TaskListRowContent({
  task,
  status,
  locked = false,
  lockReason,
  recurrenceStatus,
  pendingAccept = false,
}: {
  task: Task;
  status: CategoryTaskStatus;
  locked?: boolean;
  lockReason?: string | null;
  recurrenceStatus?: string | null;
  pendingAccept?: boolean;
}) {
  const recurrence = task.recurrence ?? 'none';
  const recurrenceBadge =
    recurrence !== 'none'
      ? TASK_RECURRENCE_LABELS[recurrence as TaskRecurrence]
      : null;

  return (
    <>
      <div className="task-list-row__main">
        <h3 className="task-list-row__title">
          {locked && <span aria-hidden>🔒 </span>}
          {task.title}
          {task.isExamTask && (
            <span className="tag tag--warn task-list-row__exam">Exam</span>
          )}
          {recurrenceBadge && (
            <span className="tag tag--info task-list-row__recurrence">
              {recurrenceBadge}
            </span>
          )}
        </h3>
        {task.description && (
          <p className="task-list-row__desc">{task.description}</p>
        )}
        {recurrenceStatus && (
          <p className="task-list-row__recurrence-status muted">{recurrenceStatus}</p>
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
        <span
          className={`task-list-row__status task-list-row__status--${status}${pendingAccept ? ' task-list-row__status--accept' : ''}`}
        >
          {pendingAccept ? 'Accept' : locked && status !== 'done' ? 'Locked' : STATUS_LABELS[status]}
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
