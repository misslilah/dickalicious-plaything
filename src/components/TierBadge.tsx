import { tierAccessLabel, tierLabel } from '../lib/tiers';
import type { ContentTier } from '../types';

interface TierBadgeProps {
  tier: ContentTier | null | undefined;
  /** Use upload-style labels (Sweetie+, Slut only). Default: short tier name. */
  accessStyle?: boolean;
  className?: string;
}

export function TierBadge({
  tier,
  accessStyle = false,
  className = '',
}: TierBadgeProps) {
  const effective = tier ?? 'public';
  const label = accessStyle ? tierAccessLabel(effective) : tierLabel(effective);
  const variant =
    effective === 'public'
      ? 'tier-badge--public'
      : effective === 'slut'
        ? 'tier-badge--slut'
        : 'tier-badge--tier';

  return (
    <span
      className={`tier-badge ${variant} ${className}`.trim()}
      title={accessStyle ? undefined : `Minimum tier: ${tierLabel(effective)}`}
    >
      {label}
    </span>
  );
}
