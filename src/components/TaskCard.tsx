import type { Category, Task } from '../types';

interface TaskCardProps {
  task: Task;
  category?: Category;
  completed?: boolean;
  onToggle?: () => void;
  showXp?: boolean;
  disabled?: boolean;
}

const frequencyLabels: Record<Task['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  once: 'One-time',
};

export function TaskCard({
  task,
  category,
  completed = false,
  onToggle,
  showXp = true,
  disabled = false,
}: TaskCardProps) {
  return (
    <article
      className={`task-card${completed ? ' task-card--done' : ''}${disabled ? ' task-card--disabled' : ''}`}
    >
      <label className="task-card__label">
        {onToggle && (
          <input
            type="checkbox"
            checked={completed}
            disabled={disabled}
            onChange={onToggle}
            className="task-card__check"
          />
        )}
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
            <span className="task-card__freq">{frequencyLabels[task.frequency]}</span>
          </div>
          <h3 className="task-card__title">{task.title}</h3>
          <p className="task-card__desc">{task.description}</p>
          <div className="task-card__meta">
            <span>Lvl. {task.minLevel}+</span>
            {task.durationMinutes && <span>{task.durationMinutes} min</span>}
            {showXp && <span className="task-card__xp">+{task.xpReward} XP</span>}
          </div>
        </div>
      </label>
    </article>
  );
}
