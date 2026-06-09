import { useEffect, useState } from 'react';
import type { PunishmentTemplate, ThronePaymentPending } from '../types';
import {
  clearPunishmentSessionProgress,
  usePunishmentCompletion,
} from '../hooks/usePunishmentCompletion';
import { clearPunishmentPhraseChallenge } from '../lib/punishmentPhraseChallenge';
import {
  formatThroneAmountEur,
  punishmentHasRequirements,
  punishmentHasThronePayment,
} from '../lib/punishmentRequirements';
import {
  cancelThronePaymentPending,
  startThronePunishmentPending,
} from '../lib/throneDb';
import { PunishmentPhraseChallengeModal } from './PunishmentPhraseChallengeModal';

interface PunishmentCompletionModalProps {
  template: PunishmentTemplate | null;
  open: boolean;
  malus: number;
  userId?: string;
  thronePending?: ThronePaymentPending | null;
  onThronePendingChange?: (pending: ThronePaymentPending | null) => void;
  onThroneVerified?: () => void;
  onClose: () => void;
  onComplete: (templateId: string) => void;
}

export function PunishmentCompletionModal({
  template,
  open,
  malus,
  userId,
  thronePending,
  onThronePendingChange,
  onThroneVerified,
  onClose,
  onComplete,
}: PunishmentCompletionModalProps) {
  const [showPhraseModal, setShowPhraseModal] = useState(false);
  const [phraseFailNotice, setPhraseFailNotice] = useState<string | null>(null);
  const [declaringPayment, setDeclaringPayment] = useState(false);
  const [throneError, setThroneError] = useState<string | null>(null);

  const {
    hasTimer,
    hasPage,
    hasPhrase,
    countdown,
    timerStarted,
    timerRunning,
    timerDone,
    startPunishmentTimer,
    pageOpened,
    phraseDone,
    phraseChallengeFailed,
    refreshPhraseChallenge,
    canComplete,
    openPage,
    finishRequirements,
  } = usePunishmentCompletion(template ?? { id: '', title: '', description: '', trigger: { type: 'malus_relief' }, malusPointsRelieved: 0 });

  useEffect(() => {
    if (!open) {
      setShowPhraseModal(false);
      setPhraseFailNotice(null);
      setThroneError(null);
    }
  }, [open]);

  useEffect(() => {
    if (
      thronePending?.status === 'completed' &&
      thronePending.punishmentTemplateId === template?.id
    ) {
      onThroneVerified?.();
    }
  }, [thronePending, template?.id, onThroneVerified]);

  if (!open || !template) return null;

  const isThronePunishment = punishmentHasThronePayment(template);
  const waitingThrone =
    isThronePunishment && thronePending?.status === 'waiting';
  const hasRequirements = punishmentHasRequirements(template) && !waitingThrone;
  const malusBlocked = malus <= 0;
  const throneAmountLabel =
    template.throneAmountCents != null
      ? `€${formatThroneAmountEur(template.throneAmountCents)}`
      : null;

  const handleClose = () => {
    onClose();
  };

  const handleComplete = () => {
    if (malusBlocked || !canComplete || isThronePunishment) return;
    clearPunishmentPhraseChallenge(template.id);
    finishRequirements();
    onComplete(template.id);
  };

  const handleDeclareThronePayment = async () => {
    if (!userId || malusBlocked || declaringPayment || waitingThrone || !isThronePunishment) {
      return;
    }
    if (!pageOpened && hasPage) {
      setThroneError('Open the Throne link before declaring payment.');
      return;
    }
    if (!canComplete) return;

    setDeclaringPayment(true);
    setThroneError(null);
    const result = await startThronePunishmentPending(userId, template.id);
    setDeclaringPayment(false);
    if (!result.ok) {
      setThroneError(result.error);
      return;
    }
    onThronePendingChange?.(result.pending);
  };

  const handleCancelThronePending = async () => {
    if (!thronePending || thronePending.status !== 'waiting') return;
    setThroneError(null);
    const result = await cancelThronePaymentPending(thronePending.id);
    if (!result.ok) {
      setThroneError(result.error);
      return;
    }
    onThronePendingChange?.(null);
  };

  const openPhraseChallenge = () => {
    if (phraseDone || phraseChallengeFailed) return;
    setShowPhraseModal(true);
  };

  const requirementHints: string[] = [];
  if (hasRequirements) {
    if (hasTimer && !timerStarted) requirementHints.push('Start the timer');
    else if (hasTimer && timerRunning) requirementHints.push('Wait for the timer');
    if (hasPage && !pageOpened) requirementHints.push('Open the required site');
    if (hasPhrase && phraseChallengeFailed)
      requirementHints.push('Phrase challenge failed');
    else if (hasPhrase && !phraseDone) requirementHints.push('Complete the phrase challenge');
  }

  return (
    <div
      className="phrase-modal punishment-completion-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="punishment-completion-title"
    >
      <div
        className="phrase-modal__backdrop"
        aria-hidden="true"
        onClick={handleClose}
      />
      <div className="phrase-modal__panel punishment-completion-modal__panel">
        <h2 id="punishment-completion-title" className="phrase-modal__title">
          {template.title}
        </h2>
        {template.description && (
          <p className="muted punishment-completion-modal__desc">
            {template.description}
          </p>
        )}
        <p className="punishment-completion-modal__relief muted">
          Clears up to {template.malusPointsRelieved} malus
          {isThronePunishment && throneAmountLabel
            ? ` · Throne gift ${throneAmountLabel}`
            : ''}
        </p>

        {isThronePunishment && !malusBlocked && (
          <p className="muted punishment-completion-modal__throne-hint">
            Pay {throneAmountLabel ?? 'the required amount'} on Throne, then declare payment.
            Your malus is reduced automatically when the webhook verifies the gift amount.
          </p>
        )}

        {malusBlocked && (
          <p className="login-error" role="alert">
            You need malus points before you can complete this punishment.
          </p>
        )}

        {(phraseFailNotice || phraseChallengeFailed) && (
          <p className="task-card__phrase-fail" role="alert">
            {phraseFailNotice ??
              'Phrase challenge failed — close and try again later.'}
          </p>
        )}

        {throneError && (
          <p className="login-error" role="alert">
            {throneError}
          </p>
        )}

        {waitingThrone && (
          <div className="training-task-card__throne-waiting">
            <p className="training-task-card__throne-waiting-msg" role="status">
              Waiting for Throne payment verification…
            </p>
            <p className="muted">
              Payment is matched by gift amount ({throneAmountLabel ?? 'tier'}). It may
              complete automatically when the webhook arrives.
            </p>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => void handleCancelThronePending()}
            >
              Cancel wait
            </button>
          </div>
        )}

        {hasRequirements && !malusBlocked && (
          <div className="task-gate punishment-completion-modal__gate">
            {hasTimer && (
              <div className="task-gate__block">
                <span className="task-gate__label">Timer</span>
                {!timerStarted ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={startPunishmentTimer}
                  >
                    Start timer
                  </button>
                ) : timerDone ? (
                  <span className="task-gate__ok">Ready</span>
                ) : (
                  <>
                    <span className="task-gate__status">Timer running</span>
                    <span className="task-gate__countdown" aria-live="polite">
                      {countdown}
                    </span>
                  </>
                )}
              </div>
            )}

            {hasPage && (
              <div className="task-gate__block">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={openPage}
                >
                  Open site
                </button>
                {pageOpened && <span className="task-gate__ok">Site opened</span>}
              </div>
            )}

            {hasPhrase && !phraseChallengeFailed && (
              <div className="task-gate__block">
                {phraseDone ? (
                  <span className="task-gate__ok">Phrase complete</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={openPhraseChallenge}
                  >
                    Begin phrase
                  </button>
                )}
              </div>
            )}

            {requirementHints.length > 0 && (
              <p className="task-gate__hint muted">{requirementHints.join(' · ')}</p>
            )}
          </div>
        )}

        <div className="btn-row punishment-completion-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={handleClose}>
            Cancel
          </button>
          {isThronePunishment && !waitingThrone ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={malusBlocked || !canComplete || declaringPayment || !userId}
              onClick={() => void handleDeclareThronePayment()}
            >
              {declaringPayment ? 'Submitting…' : 'I completed payment on Throne'}
            </button>
          ) : !isThronePunishment ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={malusBlocked || !canComplete || phraseChallengeFailed}
              onClick={handleComplete}
            >
              Complete punishment
            </button>
          ) : null}
        </div>
      </div>

      <PunishmentPhraseChallengeModal
        template={template}
        open={showPhraseModal}
        onPassed={() => {
          refreshPhraseChallenge();
          setShowPhraseModal(false);
          setPhraseFailNotice(null);
        }}
        onFailed={() => {
          refreshPhraseChallenge();
          setShowPhraseModal(false);
          setPhraseFailNotice('Phrase challenge failed — close and try again.');
        }}
      />
    </div>
  );
}

export function resetPunishmentCompletionSession(templateId: string): void {
  clearPunishmentPhraseChallenge(templateId);
  clearPunishmentSessionProgress(templateId);
}
