import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { TierBadge } from './TierBadge';
import type { VideoCategory } from '../types';

interface VideoCategoryCardProps {
  category: VideoCategory;
  videoCount: number;
  locked?: boolean;
  lockReason?: string;
  lockedVideoCount?: number;
  onLockedClick?: () => void;
}

export function VideoCategoryCard({
  category,
  videoCount,
  locked = false,
  lockReason,
  lockedVideoCount = 0,
  onLockedClick,
}: VideoCategoryCardProps) {
  const color = category.color ?? '#c084fc';
  const icon = category.icon ?? '🎬';
  const requiredTier = category.requiredTier ?? 'public';
  const showTierBadge = locked || (requiredTier !== 'public' && lockedVideoCount > 0);

  const body = (
    <>
      <div className="category-card__image-wrap">
        <div className="category-card__placeholder" aria-hidden>
          <span className="category-card__icon">{icon}</span>
        </div>
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
        <h3 className="category-card__name">{category.name}</h3>
        <p className="category-card__meta muted">
          {videoCount} {videoCount === 1 ? 'video' : 'videos'}
          {locked ? (
            <>
              {' '}
              <span className="video-tier-lock" aria-label={lockReason ?? 'Locked'}>
                · Locked
              </span>
            </>
          ) : lockedVideoCount > 0 ? (
            <>
              {' '}
              <span className="video-tier-lock" aria-label={`${lockedVideoCount} locked`}>
                🔒 {lockedVideoCount} locked
              </span>
            </>
          ) : null}
        </p>
        {showTierBadge && (
          <p className="category-card__meta">
            <TierBadge tier={requiredTier} accessStyle />
          </p>
        )}
      </div>
    </>
  );

  if (locked) {
    return (
      <button
        type="button"
        className="category-card category-card--locked video-category-card--locked"
        style={{ '--cat-color': color } as CSSProperties}
        onClick={onLockedClick}
        aria-disabled={!onLockedClick}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      to={`/videos/category/${category.id}`}
      className="category-card"
      style={{ '--cat-color': color } as CSSProperties}
    >
      {body}
    </Link>
  );
}
