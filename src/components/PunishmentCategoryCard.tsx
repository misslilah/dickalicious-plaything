import type { CSSProperties } from 'react';
import type { PunishmentCategory } from '../types';
import { isCategoryImagePreview } from '../lib/categoryImage';

interface PunishmentCategoryCardProps {
  category: PunishmentCategory;
  onSelect?: () => void;
  selected?: boolean;
  /** Static preview (no button). */
  preview?: boolean;
}

export function PunishmentCategoryCard({
  category,
  onSelect,
  selected = false,
  preview = false,
}: PunishmentCategoryCardProps) {
  const imagePreview = isCategoryImagePreview(category.imageUrl)
    ? category.imageUrl
    : null;

  const body = (
    <>
      <div className="category-card__image-wrap">
        {imagePreview ? (
          <img src={imagePreview} alt="" className="category-card__image" />
        ) : (
          <div className="category-card__placeholder" aria-hidden>
            <span className="category-card__icon">⚡</span>
          </div>
        )}
      </div>
      <div className="category-card__body">
        <h3 className="category-card__name">{category.name}</h3>
        {category.description && (
          <p className="category-card__meta muted">{category.description}</p>
        )}
      </div>
    </>
  );

  const className = `category-card punishment-category-card${
    selected ? ' punishment-category-card--selected' : ''
  }`;
  const style = { '--cat-color': 'var(--accent)' } as CSSProperties;

  if (preview) {
    return (
      <div className="category-card punishment-category-card" style={style}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {body}
    </button>
  );
}
