import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { UniversityClass } from '../types';

export function UniversityClassCard({
  item,
  categoryCount,
  categoryLabel = 'categories',
}: {
  item: UniversityClass;
  categoryCount: number;
  categoryLabel?: string;
}) {
  const singular =
    categoryLabel.endsWith('s') && categoryCount === 1
      ? categoryLabel.slice(0, -1)
      : categoryLabel;
  return (
    <Link
      to={`/university/class/${item.id}`}
      className="university-class-card"
      style={{ '--class-color': item.color } as CSSProperties}
    >
      <span className="university-class-card__icon" aria-hidden>
        {item.icon || '🎓'}
      </span>
      <div className="university-class-card__body">
        <h3 className="university-class-card__name">{item.name}</h3>
        <p className="muted university-class-card__meta">
          {categoryCount} {categoryCount === 1 ? singular : categoryLabel}
        </p>
      </div>
    </Link>
  );
}
