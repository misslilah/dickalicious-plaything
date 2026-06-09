import { useEffect, useRef, useState } from 'react';
import type {
  ThronePaymentPending,
  TrainingTask,
  TrainingTaskCompletion,
} from '../types';
import {
  cancelThronePaymentPending,
  startThronePaymentPending,
} from '../lib/throneDb';
import { useTaskCompletion } from '../hooks/useTaskCompletion';
import { PhraseChallengeModal } from './PhraseChallengeModal';
import {
  trainingTaskAsTaskAdapter,
  trainingTaskNeedsProof,
} from '../lib/trainingDb';
import { formatCountdown } from '../lib/taskTimers';
import {
  getTrainingVideoUrl,
  TRAINING_PROOF_IMAGE_ACCEPT,
  uploadTrainingProofPhoto,
  trainingProofPhotoStoragePath,
} from '../lib/trainingStorage';
interface TrainingTaskCardProps {
  task: TrainingTask;
  completion?: TrainingTaskCompletion;
  thronePending?: ThronePaymentPending;
  blackmailEnabled: boolean;
  userId: string;
  onComplete: (
    proofPhotoPath: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onThronePendingChange?: (pending: ThronePaymentPending | null) => void;
}

export function TrainingTaskCard({
  task,
  completion,
  thronePending,
  blackmailEnabled,
  userId,
  onComplete,
  onThronePendingChange,
}: TrainingTaskCardProps) {
  const adapter = trainingTaskAsTaskAdapter(task);
  const completed = Boolean(completion);
  const needsProof = trainingTaskNeedsProof(task, blackmailEnabled);
  const proofStatus = completion?.proofStatus;

  const [showPhraseModal, setShowPhraseModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [declaringPayment, setDeclaringPayment] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const isThroneTask = Boolean(task.thronePayment);
  const waitingThrone =
    isThroneTask && thronePending?.status === 'waiting' && !completed;

  const {
    hasTimer,
    hasPage,
    hasPhrase,
    countdown,
    timerStarted,
    timerRunning,
    timerDone,
    startTaskTimer,
    pageOpened,
    phraseDone,
    canComplete,
    openPage,
    finishRequirements,
    refreshPhraseChallenge,
  } = useTaskCompletion(adapter, completed);

  useEffect(() => {
    if (!task.videoPath) {
      setVideoUrl(null);
      return;
    }
    let cancelled = false;
    void getTrainingVideoUrl(task.videoPath).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setVideoUrl(result.url);
        setVideoError(null);
      } else {
        setVideoUrl(null);
        setVideoError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [task.videoPath]);

  useEffect(() => {
    return () => {
      if (proofPreview) URL.revokeObjectURL(proofPreview);
    };
  }, [proofPreview]);

  const handleProofChange = (file: File | null) => {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(file);
    setProofPreview(file ? URL.createObjectURL(file) : null);
    setCompletionError(null);
  };

  const handleDeclareThronePayment = async () => {
    if (completed || declaringPayment || waitingThrone) return;
    if (!pageOpened && hasPage) {
      setCompletionError('Open the Throne link before declaring payment.');
      return;
    }
    if (!canComplete) return;

    setDeclaringPayment(true);
    setCompletionError(null);
    const result = await startThronePaymentPending(userId, task.id);
    setDeclaringPayment(false);
    if (!result.ok) {
      setCompletionError(result.error);
      return;
    }
    onThronePendingChange?.(result.pending);
  };

  const handleCancelThronePending = async () => {
    if (!thronePending || thronePending.status !== 'waiting') return;
    setCompletionError(null);
    const result = await cancelThronePaymentPending(thronePending.id);
    if (!result.ok) {
      setCompletionError(result.error);
      return;
    }
    onThronePendingChange?.(null);
  };

  const handleComplete = async () => {
    if (completed || completing || !canComplete || isThroneTask) return;
    if (needsProof && !proofFile) {
      setCompletionError('Upload a proof photo before completing this task.');
      proofInputRef.current?.focus();
      return;
    }

    setCompleting(true);
    setCompletionError(null);

    let proofPath: string | null = null;
    if (needsProof && proofFile) {
      const path = trainingProofPhotoStoragePath(userId, task.id, proofFile.name);
      const uploaded = await uploadTrainingProofPhoto(
        path,
        proofFile,
        proofFile.type || 'image/jpeg',
      );
      if (!uploaded.ok) {
        setCompleting(false);
        setCompletionError(uploaded.error);
        return;
      }
      proofPath = path;
    }

    const result = await onComplete(proofPath);
    setCompleting(false);
    if (!result.ok) {
      setCompletionError(result.error);
      return;
    }
    finishRequirements();
  };

  const requirementHints: string[] = [];
  if (task.videoPath && !videoUrl && !videoError) requirementHints.push('Loading video…');
  if (hasTimer && !timerStarted) requirementHints.push('Start the timer');
  else if (hasTimer && timerRunning) requirementHints.push('Wait for the timer');
  if (hasPage && !pageOpened) requirementHints.push('Open the link');
  if (hasPhrase && !phraseDone) requirementHints.push('Type the required phrase');
  if (needsProof && !proofFile && !completed) requirementHints.push('Upload proof photo');
  if (isThroneTask && !completed && !waitingThrone) {
    requirementHints.push('Pay on Throne, then declare payment');
  }

  return (
    <article className="card training-task-card">
      <header className="training-task-card__header">
        <h3 className="training-task-card__title">{task.title}</h3>
        {task.assignedUserId && (
          <span className="training-task-card__personal-badge">Personal</span>
        )}
        {completed && (
          <span
            className={`training-task-card__status training-task-card__status--done`}
          >
            Completed
          </span>
        )}
        {isThroneTask && !completed && (
          <span className="training-task-card__personal-badge">Throne payment</span>
        )}
        {completed && proofStatus && (
          <span
            className={`training-task-card__proof training-task-card__proof--${proofStatus}`}
          >
            Proof: {proofStatus}
          </span>
        )}
      </header>

      {task.description && (
        <p className="training-task-card__desc muted">{task.description}</p>
      )}

      {task.videoPath && (
        <div className="training-task-card__video">
          {videoUrl ? (
            <video src={videoUrl} controls className="training-task-card__video-el" />
          ) : videoError ? (
            <p className="login-error" role="alert">
              {videoError}
            </p>
          ) : (
            <p className="muted">Loading training video…</p>
          )}
        </div>
      )}

      {!completed && (hasTimer || hasPage || hasPhrase) && (
        <div className="training-task-card__requirements">
          {hasTimer && (
            <div className="training-task-card__req-row">
              {!timerStarted ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={startTaskTimer}
                >
                  Start timer
                </button>
              ) : timerDone ? (
                <span className="training-task-card__req-done">Timer complete</span>
              ) : (
                <span className="training-task-card__timer" aria-live="polite">
                  {formatCountdown(countdown)}
                </span>
              )}
            </div>
          )}
          {hasPage && (
            <div className="training-task-card__req-row">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={pageOpened}
                onClick={() => openPage()}
              >
                {pageOpened ? 'Link opened' : 'Open link'}
              </button>
            </div>
          )}
          {hasPhrase && (
            <div className="training-task-card__req-row">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={phraseDone}
                onClick={() => setShowPhraseModal(true)}
              >
                {phraseDone ? 'Phrase verified' : 'Type phrase'}
              </button>
            </div>
          )}
        </div>
      )}

      {!completed && needsProof && (
        <div className="training-task-card__proof-upload">
          <label className="field">
            <span>Proof photo (required)</span>
            <input
              ref={proofInputRef}
              type="file"
              accept={TRAINING_PROOF_IMAGE_ACCEPT}
              onChange={(e) => handleProofChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {proofPreview && (
            <img
              src={proofPreview}
              alt="Proof preview"
              className="training-task-card__proof-preview"
            />
          )}
        </div>
      )}

      {requirementHints.length > 0 && !completed && (
        <p className="muted training-task-card__hints">{requirementHints.join(' · ')}</p>
      )}

      {completionError && (
        <p className="login-error" role="alert">
          {completionError}
        </p>
      )}

      {waitingThrone && (
        <div className="training-task-card__throne-waiting">
          <p className="training-task-card__throne-waiting-msg" role="status">
            Waiting for Throne payment verification…
          </p>
          <p className="muted">
            Your Mistress will confirm when the gift appears on Throne, or it may complete
            automatically if the webhook is configured.
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => void handleCancelThronePending()}
          >
            Cancel waiting
          </button>
        </div>
      )}

      {!completed && isThroneTask && !waitingThrone && (
        <button
          type="button"
          className="btn btn--primary training-task-card__complete"
          disabled={!canComplete || declaringPayment || (hasPage && !pageOpened)}
          onClick={() => void handleDeclareThronePayment()}
        >
          {declaringPayment ? 'Submitting…' : 'I completed payment on Throne'}
        </button>
      )}

      {!completed && !isThroneTask && (
        <button
          type="button"
          className="btn btn--primary training-task-card__complete"
          disabled={!canComplete || completing || (needsProof && !proofFile)}
          onClick={() => void handleComplete()}
        >
          {completing ? 'Completing…' : 'Mark complete'}
        </button>
      )}

      <PhraseChallengeModal
        task={adapter}
        open={showPhraseModal}
        onPassed={() => {
          setShowPhraseModal(false);
          refreshPhraseChallenge();
        }}
        onFailed={() => setShowPhraseModal(false)}
      />
    </article>
  );
}
