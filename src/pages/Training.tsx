import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BlackmailCertificateGate } from '../components/BlackmailCertificateGate';
import { TrainingGate } from '../components/TrainingGate';
import { TrainingTaskCard } from '../components/TrainingTaskCard';
import { useAppStore } from '../hooks/useAppStore';
import { getPatreonPageUrl } from '../lib/patreon';
import { tierLabel } from '../lib/tiers';
import { canAccessTraining } from '../lib/trainingAccess';
import {
  completeTrainingTask,
  enableTrainingBlackmail,
  fetchTrainingBlackmailProfile,
  fetchTrainingTasksForUser,
  fetchUserTrainingCompletions,
  trainingTaskNeedsProof,
} from '../lib/trainingDb';
import { USER_PREVIEW_PROGRESS_BLOCKED } from '../lib/adminUserMode';
import { getSupabase } from '../lib/supabase';
import { fetchUserThronePending } from '../lib/throneDb';
import type {
  ThronePaymentPending,
  TrainingBlackmailProfile,
  TrainingTask,
  TrainingTaskCompletion,
} from '../types';

export function Training() {
  const { session, effectiveSession, isEffectiveAdmin, adminUserPreview } = useAppStore();
  const navigate = useNavigate();
  const isAdmin = isEffectiveAdmin;
  const userId = session?.userId;
  const hasAccess = canAccessTraining(
    effectiveSession?.patreonTier,
    effectiveSession?.patreonStatus,
    isAdmin,
  );
  const [certified, setCertified] = useState(false);
  const [blackmail, setBlackmail] = useState<TrainingBlackmailProfile>({
    enabled: false,
    consentedAt: null,
  });
  const [showBlackmailGate, setShowBlackmailGate] = useState(false);
  const [blackmailSaving, setBlackmailSaving] = useState(false);
  const [blackmailError, setBlackmailError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TrainingTask[]>([]);
  const [completions, setCompletions] = useState<TrainingTaskCompletion[]>([]);
  const [thronePending, setThronePending] = useState<ThronePaymentPending[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const patreonUrl = getPatreonPageUrl();

  const completionByTaskId = useMemo(() => {
    const map = new Map<string, TrainingTaskCompletion>();
    for (const c of completions) map.set(c.taskId, c);
    return map;
  }, [completions]);

  const thronePendingByTaskId = useMemo(() => {
    const map = new Map<string, ThronePaymentPending>();
    for (const p of thronePending) {
      if (p.status === 'waiting' && p.taskId) {
        map.set(p.taskId, p);
      }
    }
    return map;
  }, [thronePending]);

  const loadTrainingData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [blackmailResult, tasksResult, completionsResult, pendingResult] =
      await Promise.all([
        fetchTrainingBlackmailProfile(userId),
        fetchTrainingTasksForUser(userId),
        fetchUserTrainingCompletions(userId),
        fetchUserThronePending(userId),
      ]);
    setLoading(false);

    if (!blackmailResult.ok) {
      setLoadError(blackmailResult.error);
      return;
    }
    if (!tasksResult.ok) {
      setLoadError(tasksResult.error);
      return;
    }
    if (!completionsResult.ok) {
      setLoadError(completionsResult.error);
      return;
    }
    if (!pendingResult.ok) {
      setLoadError(pendingResult.error);
      return;
    }

    setLoadError(null);
    setBlackmail(blackmailResult.profile);
    setTasks(tasksResult.tasks);
    setCompletions(adminUserPreview ? [] : completionsResult.completions);
    setThronePending(pendingResult.pending);
  }, [userId, adminUserPreview]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`training-throne:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'throne_payment_pending',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadTrainingData();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'training_task_completions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadTrainingData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadTrainingData]);

  useEffect(() => {
    if (hasAccess && (certified || isAdmin) && userId) {
      void loadTrainingData();
    }
  }, [hasAccess, certified, isAdmin, userId, loadTrainingData]);

  const handleEnableBlackmail = async () => {
    if (!userId) return;
    setBlackmailSaving(true);
    setBlackmailError(null);
    const result = await enableTrainingBlackmail(userId);
    setBlackmailSaving(false);
    if (!result.ok) {
      setBlackmailError(result.error);
      return;
    }
    setBlackmail({ enabled: true, consentedAt: new Date().toISOString() });
    setShowBlackmailGate(false);
  };

  const handleTaskComplete = async (
    task: TrainingTask,
    proofPhotoPath: string | null,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!userId) return { ok: false, error: 'Not signed in.' };
    if (adminUserPreview) {
      return { ok: false, error: USER_PREVIEW_PROGRESS_BLOCKED };
    }
    const needsProof = trainingTaskNeedsProof(task, blackmail.enabled);
    const result = await completeTrainingTask(
      userId,
      task.id,
      proofPhotoPath,
      needsProof,
    );
    if (!result.ok) return result;
    setCompletions((prev) => [...prev, result.completion]);
    return { ok: true };
  };

  if (!hasAccess) {
    return (
      <div className="page training-page training-page--locked">
        <header className="page-header">
          <h2>Training</h2>
        </header>
        <section className="card training-locked" aria-labelledby="training-locked-title">
          <span className="training-locked__icon" aria-hidden>
            🔒
          </span>
          <h3 id="training-locked-title" className="section-title">
            Slut tier required
          </h3>
          <p className="training-locked__message">
            Training is available only for <strong>{tierLabel('slut')}</strong> tier
            members. Upgrade on{' '}
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>{' '}
            or check <Link to="/settings">Settings</Link>.
          </p>
        </section>
      </div>
    );
  }

  if (!isAdmin && !certified) {
    return (
      <div className="page training-page">
        <TrainingGate
          onAccept={() => setCertified(true)}
          onCancel={() => navigate(-1)}
        />
      </div>
    );
  }

  if (showBlackmailGate) {
    return (
      <div className="page training-page">
        <BlackmailCertificateGate
          onAccept={() => void handleEnableBlackmail()}
          onCancel={() => setShowBlackmailGate(false)}
          loading={blackmailSaving}
          error={blackmailError}
        />
      </div>
    );
  }

  return (
    <div className="page training-page">
      <header className="page-header">
        <h2>Training</h2>
      </header>

      <section className="card training-blackmail-card">
        <h3 className="section-title">Blackmail roleplay</h3>
        {blackmail.enabled ? (
          <p className="training-blackmail-card__status">
            <span className="training-blackmail-card__badge training-blackmail-card__badge--on">
              Enabled
            </span>
            {blackmail.consentedAt && (
              <span className="muted">
                {' '}
                · Certified {new Date(blackmail.consentedAt).toLocaleDateString()}
              </span>
            )}
          </p>
        ) : (
          <>
            <p className="muted">
              Optional fictional roleplay opt-in. Tasks marked as requiring proof will ask
              for a photo when Blackmail is enabled.
            </p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setBlackmailError(null);
                setShowBlackmailGate(true);
              }}
            >
              Activate Blackmail certificate
            </button>
          </>
        )}
      </section>

      {loadError && (
        <p className="login-error" role="alert">
          {loadError}
        </p>
      )}

      {loading ? (
        <section className="card training-empty">
          <p className="muted training-empty__message">Loading training tasks…</p>
        </section>
      ) : tasks.length === 0 ? (
        <section className="card training-empty">
          <p className="muted training-empty__message">
            No training tasks yet. Your Mistress will add them soon.
          </p>
        </section>
      ) : (
        <div className="training-task-list">
          {tasks.map((task) => (
            <TrainingTaskCard
              key={task.id}
              task={task}
              completion={completionByTaskId.get(task.id)}
              thronePending={thronePendingByTaskId.get(task.id)}
              blackmailEnabled={blackmail.enabled}
              userId={userId!}
              onComplete={(proofPhotoPath) =>
                handleTaskComplete(task, proofPhotoPath)
              }
              onThronePendingChange={(pending) => {
                setThronePending((prev) => {
                  const rest = prev.filter((p) => p.taskId !== task.id);
                  return pending ? [...rest, pending] : rest;
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
