import type { CSSProperties } from 'react';
import type { PunishmentCategory } from '../types';
import { isCategoryImagePreview } from '../lib/categoryImage';

interface PunishmentCategoryCardProps {
  category: PunishmentCategory;
  onSelect: () => void;
}

export function PunishmentCategoryCard({
  category,
  onSelect,
}: PunishmentCategoryCardProps) {
  const imagePreview = isCategoryImagePreview(category.imageUrl)
    ? category.imageUrl
    : null;

  return (
    <button
      type="button"
      className="category-card punishment-category-card"
      style={{ '--cat-color': 'var(--accent)' } as CSSProperties}
      onClick={onSelect}
    >
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
    </button>
  );
}
