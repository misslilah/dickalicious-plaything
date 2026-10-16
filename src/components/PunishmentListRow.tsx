import { isCategoryImagePreview } from '../lib/categoryImage';
import {
  formatThroneAmountEur,
  punishmentHasThronePayment,
} from '../lib/punishmentRequirements';
import type { PunishmentTemplate } from '../types';

function snippet(text: string, max = 110): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function formatTimerBadge(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m timer`;
  }
  return `${seconds}s timer`;
}

function requirementBadges(template: PunishmentTemplate): { key: string; label: string }[] {
  const badges: { key: string; label: string }[] = [];
  if (punishmentHasThronePayment(template)) {
    const amount =
      template.throneAmountCents != null
        ? `Throne €${formatThroneAmountEur(template.throneAmountCents)}`
        : 'Throne';
    badges.push({ key: 'throne', label: amount });
  }
  if ((template.timerSeconds ?? 0) > 0) {
    badges.push({ key: 'timer', label: formatTimerBadge(template.timerSeconds ?? 0) });
  }
  if (template.openUrl?.trim()) badges.push({ key: 'url', label: 'Open site' });
  if ((template.requiredPhrases?.length ?? 0) > 0) badges.push({ key: 'phrase', label: 'Phrase' });
  return badges;
}

export function PunishmentListRow({
  template,
  malus = 1,
  cooldownLabel = null,
  onAccept,
  preview = false,
  selected = false,
  onSelect,
  imageUrl,
  stepNumber,
  inProgress = false,
}: {
  template: PunishmentTemplate;
  malus?: number;
  cooldownLabel?: string | null;
  onAccept?: () => void;
  /** Admin catalog: same visuals, row opens the editor. */
  preview?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  imageUrl?: string;
  stepNumber?: number;
  inProgress?: boolean;
}) {
  const badges = requirementBadges(template);
  const onCooldown = cooldownLabel != null;
  const disabled = !preview && !inProgress && (malus <= 0 || onCooldown);
  const interactive = preview && onSelect != null;
  const thumb = isCategoryImagePreview(imageUrl) ? imageUrl : null;
  const description = template.description ? snippet(template.description) : '';
  const statusLabel = onCooldown
    ? 'Cooldown'
    : inProgress
      ? 'In progress'
      : preview
        ? 'Accept'
        : malus <= 0
          ? 'Locked'
          : 'Accept';
  const nodeLabel = onCooldown ? '⏳' : inProgress ? '▶' : stepNumber ?? '⚡';

  const className = [
    'punishment-path-card',
    'punishment-list-row',
    preview ? 'punishment-list-row--preview' : '',
    selected ? 'punishment-list-row--selected punishment-path-card--selected' : '',
    interactive ? 'punishment-path-card--interactive' : '',
    interactive ? '' : preview ? 'punishment-list-row--static' : '',
    onCooldown ? 'punishment-path-card--cooldown' : '',
    inProgress ? 'punishment-path-card--progress' : '',
    disabled && !preview ? 'punishment-path-card--locked' : '',
    !preview && !disabled ? 'punishment-path-card--ready' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <div className="punishment-path-card__rail" aria-hidden>
        <span
          className={`punishment-path-card__node${
            inProgress ? ' punishment-path-card__node--pulse' : ''
          }${onCooldown ? ' punishment-path-card__node--locked' : ''}`}
        >
          {nodeLabel}
        </span>
      </div>
      <div className="punishment-path-card__panel">
        <div className="punishment-path-card__thumb">
          {thumb ? (
            <img src={thumb} alt="" className="punishment-path-card__thumb-image" />
          ) : (
            <div className="punishment-path-card__thumb-placeholder" aria-hidden>
              <span>⚡</span>
            </div>
          )}
        </div>
        <div className="punishment-path-card__body">
          <div className="punishment-path-card__title-row">
            <h3 className="punishment-path-card__title">{template.title}</h3>
            <span
              className={`punishment-path-card__status punishment-path-card__status--${
                onCooldown
                  ? 'cooldown'
                  : inProgress
                    ? 'progress'
                    : disabled && !preview
                      ? 'locked'
                      : 'accept'
              }`}
            >
              {statusLabel}
            </span>
          </div>
          {description && <p className="punishment-path-card__desc">{description}</p>}
          <div className="punishment-path-card__badges">
            {badges.map((badge) => (
              <span
                key={badge.key}
                className={`tag${badge.key === 'throne' ? ' tag--warn' : ' tag--info'}`}
              >
                {badge.label}
              </span>
            ))}
            {onCooldown && (
              <span className="tag tag--muted">{cooldownLabel}</span>
            )}
          </div>
          <div className="punishment-path-card__bar">
            <span className="punishment-path-card__malus">
              Clears up to {template.malusPointsRelieved} malus
            </span>
            {preview ? (
              <span className="btn btn--primary btn--small" aria-hidden="true">
                Accept
              </span>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--small"
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onAccept?.();
                }}
                title={onCooldown ? cooldownLabel ?? undefined : undefined}
              >
                {onCooldown ? 'On cooldown' : inProgress ? 'Continue' : 'Accept'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );

  if (interactive) {
    return (
      <div
        className={className}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${template.title} — ${statusLabel}`}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect?.();
          }
        }}
      >
        {body}
      </div>
    );
  }

  return (
    <div className={className} aria-label={`${template.title} — ${statusLabel}`}>
      {body}
    </div>
  );
}
