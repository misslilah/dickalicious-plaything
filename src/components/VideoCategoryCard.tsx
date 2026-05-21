import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { VideoCategory } from '../types';

interface VideoCategoryCardProps {
  category: VideoCategory;
  videoCount: number;
}

export function VideoCategoryCard({
  category,
  videoCount,
}: VideoCategoryCardProps) {
  const color = category.color ?? '#c084fc';
  const icon = category.icon ?? '🎬';

  return (
    <Link
      to={`/videos/category/${category.id}`}
      className="category-card"
      style={{ '--cat-color': color } as CSSProperties}
    >
      <div className="category-card__image-wrap">
        <div className="category-card__placeholder" aria-hidden>
          <span className="category-card__icon">{icon}</span>
        </div>
      </div>
      <div className="category-card__body">
        <h3 className="category-card__name">{category.name}</h3>
        <p className="category-card__meta muted">
          {videoCount} {videoCount === 1 ? 'video' : 'videos'}
        </p>
      </div>
    </Link>
  );
}
