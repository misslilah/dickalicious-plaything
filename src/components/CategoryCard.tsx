import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { categoryDisplayIcon } from '../lib/categoryIcon';
import type { Category } from '../types';

interface CategoryCardProps {
  category: Category;
  taskCount: number;
  completionPercent: number;
  completedCount: number;
  isMember?: boolean;
  isCompleted?: boolean;
  isUnlocked: boolean;
  lockReason?: string | null;
  canJoin?: boolean;
  joinDisabledReason?: string | null;
  onJoin?: () => void;
  joining?: boolean;
  /** Admin picker: render as a button instead of linking to the category page. */
  onSelect?: () => void;
  selected?: boolean;
  /** Static preview (no link / no button). */
  preview?: boolean;
  tutorialTarget?: string;
  /** Replaces the default "task" / "tasks" noun. */
  countNoun?: string;
  memberYes?: string;
  memberNo?: string;
  hideProgress?: boolean;
  /** Admin/punishment picker chrome (thicker border). */
  picker?: boolean;
  /** Override the default /category/:id destination. */
  to?: string;
}

export function CategoryCard({
  category,
  taskCount,
  completionPercent,
  completedCount,
  isMember,
  isCompleted,
  isUnlocked,
  lockReason,
  canJoin,
  joinDisabledReason,
  onJoin,
  joining,
  onSelect,
  selected = false,
  preview = false,
  tutorialTarget,
  countNoun,
  memberYes = 'Joined',
  memberNo = 'Not joined',
  hideProgress = false,
  picker = false,
  to,
}: CategoryCardProps) {
  const locked = !isUnlocked && !preview && !onSelect;
  const showJoin = isUnlocked && !isMember && onJoin != null && !preview && !onSelect;

  const body = (
    <>
      <div className="category-card__image-wrap">
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt=""
            className="category-card__image"
          />
        ) : (
          <div className="category-card__placeholder" aria-hidden>
            <span className="category-card__icon">
              {categoryDisplayIcon(category.name, category.icon)}
            </span>
          </div>
        )}
        {locked && (
          <div
            className="category-card__lock-overlay"
            title={lockReason ?? 'Locked'}
          >
            <span className="category-card__lock-icon" aria-hidden>
              🔒
            </span>
            <p className="category-card__lock-text">{lockReason}</p>
          </div>
        )}
      </div>
      <div className="category-card__body">
        <div className="category-card__title-row">
          <h3 className="category-card__name">{category.name}</h3>
          {isCompleted && (
            <span className="tag tag--ok category-card__completed">Completed</span>
          )}
        </div>
        <p className="category-card__meta muted">
          {taskCount} {countNoun ?? (taskCount === 1 ? 'task' : 'tasks')}
          {isMember != null && (
            <> · {isMember ? memberYes : memberNo}</>
          )}
        </p>
        {!hideProgress && (isMember || completionPercent > 0) && taskCount > 0 && (
          <div className="category-card__progress">
            <div
              className="category-card__progress-bar"
              role="progressbar"
              aria-valuenow={completionPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${completionPercent}% complete`}
            >
              <span
                className="category-card__progress-fill"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <span className="category-card__progress-label muted">
              {completionPercent}% · {completedCount}/{taskCount}
            </span>
          </div>
        )}
        {showJoin && (
          <button
            type="button"
            className="btn btn--primary btn--small btn--block category-card__join"
            disabled={!canJoin || joining}
            title={!canJoin ? joinDisabledReason ?? undefined : undefined}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onJoin?.();
            }}
          >
            {joining ? 'Joining…' : 'Join category'}
          </button>
        )}
      </div>
    </>
  );

  const className = [
    'category-card',
    locked ? 'category-card--locked' : '',
    picker ? 'punishment-category-card' : '',
    selected ? 'punishment-category-card--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { '--cat-color': category.color } as CSSProperties;
  const tutorialAttr = tutorialTarget
    ? { 'data-tutorial': tutorialTarget }
    : undefined;

  if (preview) {
    return (
      <div className="category-card" style={style} {...tutorialAttr}>
        {body}
      </div>
    );
  }

  if (onSelect) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        aria-pressed={selected}
        onClick={onSelect}
        {...tutorialAttr}
      >
        {body}
      </button>
    );
  }

  if (locked) {
    return (
      <div className={className} style={style} {...tutorialAttr}>
        {body}
      </div>
    );
  }

  return (
    <Link
      to={to ?? `/category/${category.id}`}
      className={className}
      style={style}
      {...tutorialAttr}
    >
      {body}
    </Link>
  );
}
