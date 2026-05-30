import type { ReactNode } from 'react';
import { useBadgeTooltipPosition } from '../hooks/useBadgeTooltipPosition';
import type { Badge } from '../types';

type BadgeGridProps = {
  badges: Badge[];
  unlockedBadgeIds: string[];
};

function badgeHoverText(badge: Badge, unlocked: boolean): string {
  if (unlocked) return badge.title;
  if (badge.isSecret) return '???';
  return badge.description;
}

type LockedBadgeIconWrapProps = {
  hover: string;
  children: ReactNode;
};

function LockedBadgeIconWrap({ hover, children }: LockedBadgeIconWrapProps) {
  const {
    anchorRef,
    tooltipRef,
    tooltipStyle,
    updatePosition,
    resetPosition,
  } = useBadgeTooltipPosition();

  return (
    <div
      ref={anchorRef}
      className="profile-badge__icon-wrap"
      aria-label={hover}
      tabIndex={0}
      onMouseEnter={updatePosition}
      onFocus={updatePosition}
      onMouseLeave={resetPosition}
      onBlur={resetPosition}
    >
      {children}
      <span
        ref={tooltipRef}
        className="badge-tooltip"
        role="tooltip"
        style={tooltipStyle}
      >
        {hover}
      </span>
    </div>
  );
}

export function BadgeGrid({ badges, unlockedBadgeIds }: BadgeGridProps) {
  if (badges.length === 0) {
    return <p className="muted">No badges in the catalog yet.</p>;
  }

  const sorted = [...badges].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
  );
  const hasLocked = sorted.some((badge) => !unlockedBadgeIds.includes(badge.id));

  return (
    <>
      <ul className="profile-badge-grid" aria-label="Badges">
        {sorted.map((badge) => {
          const unlocked = unlockedBadgeIds.includes(badge.id);
          const showTitle = unlocked || !badge.isSecret;
          const hover = badgeHoverText(badge, unlocked);

          const icon = badge.imageUrl ? (
            <img
              className="profile-badge__img"
              src={badge.imageUrl}
              alt={showTitle ? badge.title : 'Secret badge'}
              width={64}
              height={64}
            />
          ) : (
            <span className="profile-badge__placeholder" aria-hidden="true">
              {unlocked ? '🏅' : '🔒'}
            </span>
          );

          return (
            <li
              key={badge.id}
              className={
                unlocked
                  ? 'profile-badge profile-badge--unlocked'
                  : 'profile-badge profile-badge--locked'
              }
            >
              {unlocked ? (
                <div className="profile-badge__icon-wrap" aria-label={hover}>
                  {icon}
                </div>
              ) : (
                <LockedBadgeIconWrap hover={hover}>{icon}</LockedBadgeIconWrap>
              )}
              {showTitle && (
                <span className="profile-badge__title">{badge.title}</span>
              )}
            </li>
          );
        })}
      </ul>
      {hasLocked && (
        <p className="profile-badge-grid__hint muted">
          Hover locked badges for unlock hints
        </p>
      )}
    </>
  );
}
