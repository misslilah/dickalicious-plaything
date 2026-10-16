import type { CSSProperties } from 'react';
import type { CategoryTaskStatus } from '../lib/gameLogic';
import { getStageLabel } from '../lib/levels';
import { TASK_RECURRENCE_LABELS } from '../lib/recurringCategoryTasks';
import type { Category, Task, TaskRecurrence } from '../types';

export type CategoryTaskPathVariant = 'path' | 'recurring' | 'exam';

export interface CategoryTaskPathCardProps {
  task: Task;
  category: Category;
  stepNumber?: number;
  status: CategoryTaskStatus;
  locked?: boolean;
  lockReason?: string | null;
  dailyLimitBlocked?: boolean;
  dailyLimitMessage?: string;
  pendingAccept?: boolean;
  recurrenceStatus?: string | null;
  prerequisiteLabel?: string | null;
  isNext?: boolean;
  variant?: CategoryTaskPathVariant;
  onOpen?: () => void;
  tutorialTarget?: string;
}

const STATUS_LABELS: Record<CategoryTaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
};

function snippet(text: string, max = 110): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function mediaKind(task: Task): 'video' | 'audio' | 'image' | 'none' {
  if (task.taskMediaUrl && task.taskMediaType === 'video') return 'video';
  if (task.taskMediaUrl && task.taskMediaType === 'audio') return 'audio';
  if (task.linkedMediaType === 'video' && task.linkedVideoId) return 'video';
  if (task.linkedMediaType === 'audio') return 'audio';
  return 'none';
}

export function CategoryTaskPathCard({
  task,
  category,
  stepNumber,
  status,
  locked = false,
  lockReason,
  dailyLimitBlocked = false,
  dailyLimitMessage,
  pendingAccept = false,
  recurrenceStatus,
  prerequisiteLabel,
  isNext = false,
  variant = 'path',
  onOpen,
  tutorialTarget,
}: CategoryTaskPathCardProps) {
  const displayStatus = pendingAccept ? 'not_started' : status;
  const isDone = !pendingAccept && status === 'done';
  const isLocked = locked && !isDone && !pendingAccept;
  const recurrence = task.recurrence ?? 'none';
  const recurrenceBadge =
    recurrence !== 'none'
      ? TASK_RECURRENCE_LABELS[recurrence as TaskRecurrence]
      : null;
  const kind = mediaKind(task);
  const thumbUrl = category.imageUrl || null;
  const statusLabel = pendingAccept
    ? 'Accept'
    : isLocked
      ? 'Locked'
      : isNext
        ? 'Next'
        : STATUS_LABELS[displayStatus];
  const nodeLabel = isDone ? '✓' : isLocked ? '🔒' : stepNumber ?? (variant === 'recurring' ? '↻' : '•');
  const showRail = variant !== 'recurring';
  const description = task.description ? snippet(task.description) : '';
  const lockMessage =
    lockReason ??
    (dailyLimitBlocked ? dailyLimitMessage : null);

  const className = [
    'category-path-card',
    `category-path-card--${displayStatus}`,
    `category-path-card--${variant}`,
    isLocked ? 'category-path-card--locked' : '',
    isDone ? 'category-path-card--done' : '',
    isNext ? 'category-path-card--next' : '',
    pendingAccept ? 'category-path-card--pending' : '',
    dailyLimitBlocked && !isDone ? 'category-path-card--limit' : '',
    onOpen ? 'category-path-card--interactive' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const style = { '--cat-color': category.color } as CSSProperties;

  const body = (
    <>
      {showRail && (
        <div className="category-path-card__rail" aria-hidden>
          <span
            className={`category-path-card__node${isNext ? ' category-path-card__node--pulse' : ''}${isDone ? ' category-path-card__node--done' : ''}${isLocked ? ' category-path-card__node--locked' : ''}`}
          >
            {nodeLabel}
          </span>
        </div>
      )}
      <div className="category-path-card__panel">
        <div className="category-path-card__thumb">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" className="category-path-card__thumb-image" />
          ) : (
            <div
              className="category-path-card__thumb-placeholder"
              style={{ background: `${category.color}22` }}
            >
              <span>{category.icon}</span>
            </div>
          )}
          {kind !== 'none' && (
            <span className="category-path-card__media-badge" aria-hidden>
              {kind === 'video' ? '▶' : '♪'}
            </span>
          )}
        </div>
        <div className="category-path-card__body">
          <div className="category-path-card__title-row">
            <h3 className="category-path-card__title">{task.title}</h3>
            <span
              className={`category-path-card__status category-path-card__status--${pendingAccept ? 'accept' : isLocked ? 'locked' : displayStatus}${isNext && !isLocked ? ' category-path-card__status--next' : ''}`}
            >
              {statusLabel}
            </span>
          </div>
          {description && (
            <p className="category-path-card__desc">{description}</p>
          )}
          <div className="category-path-card__badges">
            {task.isExamTask && <span className="tag tag--warn">Exam</span>}
            {recurrenceBadge && (
              <span className="tag tag--info">{recurrenceBadge}</span>
            )}
            {task.userStage && task.userStage !== 'any' && (
              <span className="tag tag--muted">{getStageLabel(task.userStage)}</span>
            )}
            {prerequisiteLabel && (
              <span className="tag tag--muted">After “{prerequisiteLabel}”</span>
            )}
            {isLocked && lockMessage && (
              <span className="tag tag--warn">{lockMessage}</span>
            )}
          </div>
          {recurrenceStatus && (
            <p className="category-path-card__recurrence muted">{recurrenceStatus}</p>
          )}
          <div className="category-path-card__meta">
            <span className="category-path-card__xp">+{task.xpReward} XP</span>
            {(task.pointsReward ?? 0) > 0 && (
              <span className="category-path-card__xp">+{task.pointsReward} pts</span>
            )}
            {(task.malusPointsOnFail ?? 0) > 0 && (
              <span className="category-path-card__malus">
                +{task.malusPointsOnFail} malus if started and not finished
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );

  const tutorialProps = tutorialTarget
    ? { 'data-tutorial': tutorialTarget }
    : {};

  if (onOpen) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onOpen}
        aria-label={`${task.title} — ${statusLabel}`}
        {...tutorialProps}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={className}
      style={style}
      aria-label={`${task.title} — ${statusLabel}`}
      {...tutorialProps}
    >
      {body}
    </div>
  );
}
