import { getStageLabel } from '../lib/levels';
import type { Category, Task } from '../types';
import {
  TaskCompletionGate,
  type TaskCompleteResult,
} from './TaskCompletionGate';
import { getPhraseRepeatCount } from '../lib/phraseChallenge';
import { getTaskLinkedMediaType } from '../lib/taskLinkedMedia';
import { taskHasRequirements } from '../lib/taskRequirements';

interface TaskCardProps {
  task: Task;
  category?: Category;
  scopeBadge?: string;
  completed?: boolean;
  onToggle?: () => void;
  onStart?: () => void;
  onComplete?: () => TaskCompleteResult | Promise<TaskCompleteResult>;
  onUncomplete?: () => void;
  showXp?: boolean;
  disabled?: boolean;
  /** Admin catalog: same visuals, card opens the editor. */
  preview?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

const frequencyLabels: Record<Task['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  once: 'One-time',
};

function TaskCardBody({
  task,
  category,
  scopeBadge,
  showXp,
  interactive,
}: {
  task: Task;
  category?: Category;
  scopeBadge?: string;
  showXp: boolean;
  interactive: boolean;
}) {
  const requirementBadges: string[] = [];
  if (task.timerSeconds) requirementBadges.push('Timer');
  if (task.durationSeconds) requirementBadges.push('Duration');
  if (task.openUrl?.trim()) requirementBadges.push('Open page');
  if (task.requiredPhrase?.trim()) {
    const times = getPhraseRepeatCount(task);
    requirementBadges.push(times > 1 ? `Phrase ×${times}` : 'Phrase');
  }
  const linkedType = getTaskLinkedMediaType(task);
  if (linkedType === 'video') requirementBadges.push('Video');
  if (linkedType === 'audio') requirementBadges.push('Audio');

  return (
    <div className="task-card__body">
      <div className="task-card__top">
        {category && (
          <span
            className="task-card__badge"
            style={{ borderColor: category.color, color: category.color }}
          >
            {category.icon} {category.name}
          </span>
        )}
        {scopeBadge && (
          <span className="task-card__badge task-card__badge--personal">
            {scopeBadge}
          </span>
        )}
        <span className="task-card__freq">{frequencyLabels[task.frequency]}</span>
      </div>
      <h3 className="task-card__title">{task.title}</h3>
      <p className="task-card__desc">{task.description}</p>
      <div className="task-card__meta">
        {task.userStage && task.userStage !== 'any' && (
          <span>{getStageLabel(task.userStage)}</span>
        )}
        {task.durationMinutes != null && <span>{task.durationMinutes} min</span>}
        {task.timerSeconds != null && task.timerSeconds > 0 && (
          <span>{Math.ceil(task.timerSeconds / 60)} min timer</span>
        )}
        {task.durationSeconds != null && task.durationSeconds > 0 && (
          <span>{Math.ceil(task.durationSeconds / 60)} min duration</span>
        )}
        {showXp && <span className="task-card__xp">+{task.xpReward} XP</span>}
        {(task.pointsReward ?? 0) > 0 && (
          <span className="task-card__xp">+{task.pointsReward} pts</span>
        )}
      </div>
      {requirementBadges.length > 0 && !interactive && (
        <p className="task-card__req-badges muted">
          Requires: {requirementBadges.join(', ')}
        </p>
      )}
    </div>
  );
}

export function TaskCard({
  task,
  category,
  scopeBadge,
  completed = false,
  onToggle,
  onStart,
  onComplete,
  onUncomplete,
  showXp = true,
  disabled = false,
  preview = false,
  selected = false,
  onSelect,
}: TaskCardProps) {
  const handleComplete =
    onComplete ??
    (onToggle
      ? () => {
          onToggle();
          return { ok: true as const };
        }
      : undefined);
  const handleUncomplete = onUncomplete ?? onToggle;
  const interactive = Boolean(handleComplete) && !preview;
  const gated = interactive && taskHasRequirements(task);
  const className = [
    'task-card',
    completed ? 'task-card--done' : '',
    disabled ? 'task-card--disabled' : '',
    gated ? 'task-card--gated' : '',
    preview ? 'task-card--preview' : '',
    selected ? 'task-card--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <TaskCardBody
      task={task}
      category={category}
      scopeBadge={scopeBadge}
      showXp={showXp}
      interactive={interactive}
    />
  );

  if (preview) {
    if (onSelect) {
      return (
        <button
          type="button"
          className={className}
          onClick={onSelect}
          aria-pressed={selected}
        >
          <div className="task-card__shell">{body}</div>
        </button>
      );
    }
    return (
      <article className={className}>
        <div className="task-card__shell">{body}</div>
      </article>
    );
  }

  return (
    <article className={className}>
      {interactive && handleComplete ? (
        <TaskCompletionGate
          task={task}
          completed={completed}
          disabled={disabled}
          onStart={onStart}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
        >
          <TaskCardBody
            task={task}
            category={category}
            scopeBadge={scopeBadge}
            showXp={showXp}
            interactive={interactive}
          />
        </TaskCompletionGate>
      ) : (
        <div className="task-card__shell">
          <TaskCardBody
            task={task}
            category={category}
            scopeBadge={scopeBadge}
            showXp={showXp}
            interactive={interactive}
          />
        </div>
      )}
    </article>
  );
}
