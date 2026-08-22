import { punishmentHasThronePayment } from '../lib/punishmentRequirements';
import type { PunishmentTemplate } from '../types';

function requirementBadges(template: PunishmentTemplate): string[] {
  const badges: string[] = [];
  if (punishmentHasThronePayment(template)) badges.push('Throne payment');
  if ((template.timerSeconds ?? 0) > 0) badges.push('Timer');
  if (template.openUrl?.trim()) badges.push('Open site');
  if ((template.requiredPhrases?.length ?? 0) > 0) badges.push('Phrase');
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
}: {
  template: PunishmentTemplate;
  malus?: number;
  cooldownLabel?: string | null;
  onAccept?: () => void;
  /** Admin catalog: same visuals, row opens the editor. */
  preview?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const badges = requirementBadges(template);
  const onCooldown = cooldownLabel != null;
  const disabled = !preview && (malus <= 0 || onCooldown);
  const interactive = preview && onSelect != null;
  const className = [
    'task-list-row',
    'punishment-list-row',
    preview ? 'punishment-list-row--preview' : '',
    selected ? 'punishment-list-row--selected' : '',
    interactive ? '' : preview ? 'punishment-list-row--static' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? onSelect : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
    >
      <div className="task-list-row__main">
        <h3 className="task-list-row__title">{template.title}</h3>
        {template.description && (
          <p className="task-list-row__desc">{template.description}</p>
        )}
        <div className="task-list-row__meta">
          <span className="punishment-points">
            Clears up to {template.malusPointsRelieved} malus
          </span>
          {badges.length > 0 && (
            <span className="muted"> · {badges.join(' · ')}</span>
          )}
          {onCooldown && (
            <span className="muted punishment-cooldown"> · {cooldownLabel}</span>
          )}
        </div>
      </div>
      <div className="task-list-row__aside">
        {preview ? (
          <span className="btn btn--primary btn--small" aria-hidden="true">
            Accept
          </span>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--small"
            disabled={disabled}
            onClick={onAccept}
            title={onCooldown ? cooldownLabel ?? undefined : undefined}
          >
            {onCooldown ? 'On cooldown' : 'Accept'}
          </button>
        )}
      </div>
    </div>
  );
}
