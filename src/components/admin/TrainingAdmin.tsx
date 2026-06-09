import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { usePersistedSearchParam } from '../../hooks/usePersistedSearchParam';
import { ADMIN_TRAINING_TABS } from '../../lib/adminNavPersistence';
import { useAppStore } from '../../hooks/useAppStore';
import { fetchAdminProfiles } from '../../lib/profileDb';
import type {
  SlutTrainingMember,
  ThroneGiftEvent,
  ThronePaymentPending,
  TrainingProofSubmission,
  TrainingTask,
} from '../../types';
import {
  deleteTrainingTaskDb,
  fetchActiveSlutTrainingMembers,
  fetchPendingProofSubmissions,
  fetchPersonalTrainingTasksForUser,
  fetchTrainingTasks,
  upsertTrainingTask,
  verifyTrainingProof,
} from '../../lib/trainingDb';
import {
  adminConfirmThronePayment,
  fetchRecentThroneGiftEvents,
  fetchWaitingThronePendingAdmin,
  getThroneWebhookUrl,
} from '../../lib/throneDb';
import { getSupabase } from '../../lib/supabase';
import {
  deleteTrainingVideo,
  getTrainingProofPhotoUrl,
  trainingVideoStoragePath,
  TRAINING_VIDEO_ACCEPT,
  uploadTrainingVideo,
} from '../../lib/trainingStorage';
import { UploadProgressBar } from '../UploadProgressBar';

const TRAINING_TABS = [
  { id: 'tasks' as const, label: 'Training tasks' },
  { id: 'sluts' as const, label: 'Sluts' },
  { id: 'proofs' as const, label: 'Proof verifications' },
  { id: 'throne' as const, label: 'Throne setup' },
] as const;

function emptyDraft(): TrainingTask {
  return {
    id: '',
    title: '',
    description: '',
    sortOrder: 0,
    requiresProofPhoto: false,
    isActive: true,
  };
}

export function TrainingAdmin() {
  const [tab, setTab] = usePersistedSearchParam(
    'trainingTab',
    ADMIN_TRAINING_TABS,
    'tasks',
  );

  return (
    <div className="admin-training">
      <div className="admin-minigames-tabs" role="tablist" aria-label="Training admin">
        {TRAINING_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={
              tab === id
                ? 'admin-minigames-tab admin-minigames-tab--active'
                : 'admin-minigames-tab'
            }
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'tasks' ? (
        <TrainingTasksAdmin />
      ) : tab === 'sluts' ? (
        <TrainingSlutsAdmin />
      ) : tab === 'throne' ? (
        <TrainingThroneAdmin />
      ) : (
        <TrainingProofsAdmin />
      )}
    </div>
  );
}

function TrainingTasksAdmin() {
  const [tasks, setTasks] = useState<TrainingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrainingTask>(emptyDraft);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchTrainingTasks(true);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setTasks(result.tasks);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const selectTask = (task: TrainingTask | null) => {
    if (!task) {
      setSelectedId(null);
      setDraft(emptyDraft());
      setVideoFile(null);
      return;
    }
    setSelectedId(task.id);
    setDraft({ ...task });
    setVideoFile(null);
  };

  const handleSave = async () => {
    setMessage(null);
    setError(null);
    if (!draft.title.trim()) {
      setError('Title is required.');
      return;
    }

    setUploading(true);
    let taskToSave = { ...draft, title: draft.title.trim() };

    if (!taskToSave.id) {
      const insertResult = await upsertTrainingTask(taskToSave);
      if (!insertResult.ok) {
        setUploading(false);
        setError(insertResult.error);
        return;
      }
      taskToSave = insertResult.task;
    }

    if (videoFile) {
      const path = trainingVideoStoragePath(taskToSave.id, videoFile.name);
      const uploaded = await uploadTrainingVideo(
        path,
        videoFile,
        videoFile.type || 'video/mp4',
      );
      if (!uploaded.ok) {
        setUploading(false);
        setError(uploaded.error);
        return;
      }
      taskToSave = { ...taskToSave, videoPath: path };
    }

    const saved = await upsertTrainingTask(taskToSave);
    setUploading(false);
    setUploadProgress(null);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }

    setMessage('Training task saved.');
    setVideoFile(null);
    setSelectedId(saved.task.id);
    setDraft(saved.task);
    await load();
  };

  const handleDelete = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!window.confirm(`Delete training task "${task?.title ?? id}"?`)) return;
    if (task?.videoPath) await deleteTrainingVideo(task.videoPath);
    const result = await deleteTrainingTaskDb(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (selectedId === id) selectTask(null);
    setMessage('Training task deleted.');
    await load();
  };

  return (
    <div className="admin-section">
      <section className="card admin-list-card">
        <header className="admin-list-card__header">
          <div className="admin-list-card__title-row">
            <h3 className="section-title">Training tasks</h3>
            <span className="admin-count">{filtered.length}</span>
          </div>
          <p className="muted admin-list-card__intro">
            Global training tasks visible to all Slut-tier users on the Training page.
          </p>
          <label className="field admin-list-card__search">
            <span className="visually-hidden">Search training tasks</span>
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search training tasks"
            />
          </label>
        </header>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="muted">No training tasks yet.</p>
        ) : (
          <ul className="admin-library">
            {filtered.map((task) => (
              <li
                key={task.id}
                className={
                  selectedId === task.id
                    ? 'admin-library-item admin-library-item--selected'
                    : 'admin-library-item'
                }
              >
                <button
                  type="button"
                  className="admin-library-item__main"
                  onClick={() => selectTask(task)}
                  aria-pressed={selectedId === task.id}
                >
                  <strong className="admin-library-item__title">{task.title}</strong>
                  <span className="admin-library-item__meta muted">
                    {task.isActive ? 'Active' : 'Inactive'}
                    {task.requiresProofPhoto ? ' · Proof photo' : ''}
                    {task.thronePayment ? ' · Throne payment' : ''}
                    {task.videoPath ? ' · Video' : ''}
                  </span>
                </button>
                <div className="admin-library-item__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small btn--danger-text"
                    onClick={() => void handleDelete(task.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">
          {selectedId ? 'Edit training task' : 'New training task'}
        </h3>
        {message && (
          <p className="notice admin-notice" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <TrainingTaskFormFields
          draft={draft}
          setDraft={setDraft}
          videoFile={videoFile}
          setVideoFile={setVideoFile}
          uploadProgress={uploadProgress}
        />
        <div className="btn-row admin-form-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => selectTask(null)}
          >
            New task
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={uploading}
            onClick={() => void handleSave()}
          >
            {uploading ? 'Saving…' : 'Save task'}
          </button>
        </div>
      </section>
    </div>
  );
}

function TrainingSlutsAdmin() {
  const [members, setMembers] = useState<SlutTrainingMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [tasks, setTasks] = useState<TrainingTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrainingTask>(emptyDraft);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [memberSearch, setMemberSearch] = useState('');

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    const result = await fetchActiveSlutTrainingMembers();
    setLoadingMembers(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setMembers(result.members);
  }, []);

  const loadTasks = useCallback(async (userId: string) => {
    setLoadingTasks(true);
    const result = await fetchPersonalTrainingTasksForUser(userId, true);
    setLoadingTasks(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setTasks(result.tasks);
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (selectedMemberId) {
      void loadTasks(selectedMemberId);
    } else {
      setTasks([]);
    }
  }, [selectedMemberId, loadTasks]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.username.toLowerCase().includes(q));
  }, [members, memberSearch]);

  const selectMember = (member: SlutTrainingMember | null) => {
    setSelectedMemberId(member?.id ?? null);
    setSelectedTaskId(null);
    setDraft(emptyDraft());
    setVideoFile(null);
    setMessage(null);
    setError(null);
  };

  const selectTask = (task: TrainingTask | null) => {
    if (!task) {
      setSelectedTaskId(null);
      setDraft(
        selectedMemberId
          ? { ...emptyDraft(), assignedUserId: selectedMemberId }
          : emptyDraft(),
      );
      setVideoFile(null);
      return;
    }
    setSelectedTaskId(task.id);
    setDraft({ ...task });
    setVideoFile(null);
  };

  const handleSave = async () => {
    setMessage(null);
    setError(null);
    if (!selectedMemberId) {
      setError('Select a Slut first.');
      return;
    }
    if (!draft.title.trim()) {
      setError('Title is required.');
      return;
    }

    setUploading(true);
    let taskToSave: TrainingTask = {
      ...draft,
      title: draft.title.trim(),
      assignedUserId: selectedMemberId,
    };

    if (!taskToSave.id) {
      const insertResult = await upsertTrainingTask(taskToSave);
      if (!insertResult.ok) {
        setUploading(false);
        setError(insertResult.error);
        return;
      }
      taskToSave = insertResult.task;
    }

    if (videoFile) {
      const path = trainingVideoStoragePath(taskToSave.id, videoFile.name);
      const uploaded = await uploadTrainingVideo(
        path,
        videoFile,
        videoFile.type || 'video/mp4',
      );
      if (!uploaded.ok) {
        setUploading(false);
        setError(uploaded.error);
        return;
      }
      taskToSave = { ...taskToSave, videoPath: path };
    }

    const saved = await upsertTrainingTask(taskToSave);
    setUploading(false);
    setUploadProgress(null);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }

    setMessage('Personal training task saved.');
    setVideoFile(null);
    setSelectedTaskId(saved.task.id);
    setDraft(saved.task);
    await loadTasks(selectedMemberId);
    await loadMembers();
  };

  const handleDelete = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!window.confirm(`Delete personal task "${task?.title ?? id}"?`)) return;
    if (task?.videoPath) await deleteTrainingVideo(task.videoPath);
    const result = await deleteTrainingTaskDb(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (selectedTaskId === id) selectTask(null);
    setMessage('Personal training task deleted.');
    if (selectedMemberId) await loadTasks(selectedMemberId);
  };

  return (
    <div className="admin-section">
      <section className="card admin-list-card">
        <header className="admin-list-card__header">
          <div className="admin-list-card__title-row">
            <h3 className="section-title">Sluts</h3>
            <span className="admin-count">{filteredMembers.length}</span>
          </div>
          <p className="muted admin-list-card__intro">
            Active Slut tier members. Select one to assign personal training tasks.
          </p>
          <label className="field admin-list-card__search">
            <span className="visually-hidden">Search Sluts</span>
            <input
              type="search"
              placeholder="Search…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              aria-label="Search Sluts"
            />
          </label>
        </header>
        {loadingMembers ? (
          <p className="muted">Loading…</p>
        ) : filteredMembers.length === 0 ? (
          <p className="muted">No active Slut tier members.</p>
        ) : (
          <ul className="admin-library">
            {filteredMembers.map((member) => (
              <li
                key={member.id}
                className={
                  selectedMemberId === member.id
                    ? 'admin-library-item admin-library-item--selected'
                    : 'admin-library-item'
                }
              >
                <button
                  type="button"
                  className="admin-library-item__main"
                  onClick={() => selectMember(member)}
                  aria-pressed={selectedMemberId === member.id}
                >
                  <strong className="admin-library-item__title">{member.username}</strong>
                  <span className="admin-library-item__meta muted">
                    {member.blackmailEnabled ? 'Blackmail on' : 'Blackmail off'}
                    {member.pendingProofCount > 0
                      ? ` · ${member.pendingProofCount} proof${member.pendingProofCount === 1 ? '' : 's'} pending`
                      : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedMember ? (
        <>
          <section className="card admin-list-card">
            <header className="admin-list-card__header">
              <div className="admin-list-card__title-row">
                <h3 className="section-title">Personal tasks for {selectedMember.username}</h3>
                <span className="admin-count">{tasks.length}</span>
              </div>
            </header>
            {loadingTasks ? (
              <p className="muted">Loading…</p>
            ) : tasks.length === 0 ? (
              <p className="muted">No personal tasks assigned yet.</p>
            ) : (
              <ul className="admin-library">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className={
                      selectedTaskId === task.id
                        ? 'admin-library-item admin-library-item--selected'
                        : 'admin-library-item'
                    }
                  >
                    <button
                      type="button"
                      className="admin-library-item__main"
                      onClick={() => selectTask(task)}
                      aria-pressed={selectedTaskId === task.id}
                    >
                      <strong className="admin-library-item__title">{task.title}</strong>
                      <span className="admin-library-item__meta muted">
                        {task.isActive ? 'Active' : 'Inactive'}
                        {task.requiresProofPhoto ? ' · Proof photo' : ''}
                        {task.videoPath ? ' · Video' : ''}
                      </span>
                    </button>
                    <div className="admin-library-item__actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--small btn--danger-text"
                        onClick={() => void handleDelete(task.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h3 className="section-title">
              {selectedTaskId
                ? `Edit personal task for ${selectedMember.username}`
                : `New personal task for ${selectedMember.username}`}
            </h3>
            {message && (
              <p className="notice admin-notice" role="status">
                {message}
              </p>
            )}
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}

            <TrainingTaskFormFields
              draft={draft}
              setDraft={setDraft}
              videoFile={videoFile}
              setVideoFile={setVideoFile}
              uploadProgress={uploadProgress}
            />

            <div className="btn-row admin-form-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => selectTask(null)}
              >
                New task
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={uploading}
                onClick={() => void handleSave()}
              >
                {uploading ? 'Saving…' : 'Save task'}
              </button>
            </div>
          </section>
        </>
      ) : (
        <section className="card">
          <p className="muted">Select a Slut to assign personal training tasks.</p>
        </section>
      )}
    </div>
  );
}

function TrainingTaskFormFields({
  draft,
  setDraft,
  videoFile,
  setVideoFile,
  uploadProgress,
}: {
  draft: TrainingTask;
  setDraft: Dispatch<SetStateAction<TrainingTask>>;
  videoFile: File | null;
  setVideoFile: (file: File | null) => void;
  uploadProgress: number | null;
}) {
  return (
    <>
      <div className="admin-form-block">
        <div className="field">
          <label htmlFor="tt-title">Title</label>
          <input
            id="tt-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="tt-desc">Description</label>
          <textarea
            id="tt-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="tt-sort">Sort order</label>
          <input
            id="tt-sort"
            type="number"
            value={draft.sortOrder}
            onChange={(e) =>
              setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })
            }
          />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />{' '}
            Active
          </label>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={draft.requiresProofPhoto}
              onChange={(e) =>
                setDraft({ ...draft, requiresProofPhoto: e.target.checked })
              }
            />{' '}
            Requires proof photo (when user has Blackmail enabled)
          </label>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={Boolean(draft.thronePayment)}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  thronePayment: e.target.checked,
                  openUrl: e.target.checked && !draft.openUrl ? '' : draft.openUrl,
                })
              }
            />{' '}
            Throne payment task (webhook or admin verification)
          </label>
          {draft.thronePayment && (
            <p className="muted field__hint">
              Set Open URL to the Throne gift or wishlist link. Users declare payment; a Throne
              webhook or manual admin confirmation completes the task.
            </p>
          )}
        </div>
      </div>

      <div className="admin-form-block">
        <h4 className="section-title">Completion requirements</h4>
        <div className="field">
          <label htmlFor="tt-phrase">Required phrase</label>
          <input
            id="tt-phrase"
            value={draft.requiredPhrase ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                requiredPhrase: e.target.value || undefined,
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="tt-phrase-repeat">Phrase repeat count</label>
          <input
            id="tt-phrase-repeat"
            type="number"
            min={1}
            value={draft.requiredPhraseRepeatCount ?? 1}
            onChange={(e) =>
              setDraft({
                ...draft,
                requiredPhraseRepeatCount: Math.max(1, Number(e.target.value) || 1),
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="tt-open-url">Open URL</label>
          <input
            id="tt-open-url"
            type="url"
            placeholder="https://…"
            value={draft.openUrl ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, openUrl: e.target.value || undefined })
            }
          />
        </div>
        <div className="field">
          <label>Timer (minutes / seconds)</label>
          <div className="form-inline">
            <input
              type="number"
              min={0}
              placeholder="Min"
              aria-label="Timer minutes"
              value={
                draft.timerSeconds != null ? Math.floor(draft.timerSeconds / 60) : ''
              }
              onChange={(e) => {
                const mins = e.target.value ? Number(e.target.value) : 0;
                const secs = draft.timerSeconds != null ? draft.timerSeconds % 60 : 0;
                const total = mins * 60 + secs;
                setDraft({
                  ...draft,
                  timerSeconds: total > 0 ? total : undefined,
                });
              }}
            />
            <input
              type="number"
              min={0}
              max={59}
              placeholder="Sec"
              aria-label="Timer seconds"
              value={draft.timerSeconds != null ? draft.timerSeconds % 60 : ''}
              onChange={(e) => {
                const secs = e.target.value ? Number(e.target.value) : 0;
                const mins =
                  draft.timerSeconds != null ? Math.floor(draft.timerSeconds / 60) : 0;
                const total = mins * 60 + secs;
                setDraft({
                  ...draft,
                  timerSeconds: total > 0 ? total : undefined,
                });
              }}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="tt-video">Training video</label>
          <p className="muted field__hint">
            Stored in private training-videos bucket. Max 500 MB.
          </p>
          {draft.videoPath && <p className="muted">Current: {draft.videoPath}</p>}
          <input
            id="tt-video"
            type="file"
            accept={TRAINING_VIDEO_ACCEPT}
            onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <UploadProgressBar progress={uploadProgress} />
    </>
  );
}

function formatThroneEventSummary(ev: ThroneGiftEvent): string {
  const gifter = ev.gifterName?.trim() || 'Anonymous';
  const item = ev.itemName?.trim();
  if (item) return `${gifter} — ${item}`;
  if (ev.eventType && ev.eventType !== 'gift') return `${gifter} — ${ev.eventType}`;
  return gifter;
}

function formatThronePayloadPreview(payload: Record<string, unknown> | null | undefined): string {
  if (!payload) return '';
  try {
    const text = JSON.stringify(payload);
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  } catch {
    return '';
  }
}

function TrainingThroneAdmin() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<
    (ThronePaymentPending & { username?: string; taskTitle?: string })[]
  >([]);
  const [events, setEvents] = useState<ThroneGiftEvent[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const webhookUrl = getThroneWebhookUrl();

  const load = useCallback(async () => {
    setLoading(true);
    const [pendingResult, eventsResult] = await Promise.all([
      fetchWaitingThronePendingAdmin(),
      fetchRecentThroneGiftEvents(8),
    ]);
    setLoading(false);
    if (!pendingResult.ok) {
      setError(pendingResult.error);
      return;
    }
    if (!eventsResult.ok) {
      setError(eventsResult.error);
      return;
    }
    setError(null);
    setPending(pendingResult.pending);
    setEvents(eventsResult.events);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel('admin-throne-gift-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'throne_gift_events' },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const handleConfirm = async (pendingId: string) => {
    setActingId(pendingId);
    setMessage(null);
    const result = await adminConfirmThronePayment(pendingId);
    setActingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Throne payment confirmed — training task completed.');
    await load();
  };

  return (
    <div className="admin-section">
      <section className="card">
        <h3 className="section-title">Throne webhook setup</h3>
        <p className="muted">
          Automatic task completion works when Throne sends gift events to your Supabase edge
          function. If your Throne account has no webhook field, confirm payments manually below.
        </p>
        <ol className="throne-setup-steps">
          <li>Run migrations <code>073</code> and <code>074_throne_realtime_and_rls.sql</code> in Supabase SQL Editor.</li>
          <li>
            Set <code>THRONE_WEBHOOK_SECRET</code> in Supabase → Edge Functions → Secrets.
          </li>
          <li>
            Deploy: <code>supabase functions deploy throne-webhook --no-verify-jwt</code>{' '}
            (required — without it Supabase returns 401 before your handler runs).
          </li>
          <li>
            In Throne: Settings → Alerts &amp; Integrations → Webhook Integration (if available).
            Paste the URL below. Use the same secret as{' '}
            <code>?token=&lt;secret&gt;</code>,{' '}
            <code>Authorization: Bearer &lt;secret&gt;</code>, or{' '}
            <code>X-Throne-Webhook-Secret</code>.
          </li>
          <li>
            Create a training task with &quot;Throne payment task&quot; and set Open URL to the
            Throne gift link.
          </li>
        </ol>
        {webhookUrl ? (
          <div className="field">
            <label htmlFor="throne-webhook-url">Webhook URL</label>
            <input
              id="throne-webhook-url"
              type="url"
              readOnly
              value={webhookUrl}
              onFocus={(e) => e.target.select()}
            />
          </div>
        ) : (
          <p className="login-error" role="alert">
            VITE_SUPABASE_URL is not configured — webhook URL unavailable.
          </p>
        )}
        <p className="muted field__hint">
          Streamlabs, StreamElements, and Nightbot cannot forward Throne events to a custom URL.
          Zapier/Make have no native Throne integration as of 2026.
        </p>
      </section>

      <section className="card">
        <h3 className="section-title">Waiting for verification</h3>
        <p className="muted">
          Users who clicked &quot;I completed payment on Throne&quot;. Confirm manually when you
          see the gift on Throne, or wait for the webhook to auto-complete (FIFO queue).
        </p>
        {message && (
          <p className="notice admin-notice" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="muted">No users waiting for Throne verification.</p>
        ) : (
          <ul className="training-proof-admin-list">
            {pending.map((row) => (
              <li key={row.id} className="training-proof-admin-item card">
                <div className="training-proof-admin-item__meta">
                  <strong>{row.username ?? row.userId.slice(0, 8)}</strong>
                  <span className="muted"> · {row.taskTitle ?? 'Training task'}</span>
                  <span className="muted">
                    {' '}
                    · waiting since {new Date(row.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    disabled={actingId === row.id}
                    onClick={() => void handleConfirm(row.id)}
                  >
                    Confirm payment
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="admin-list-card__title-row">
          <h3 className="section-title">Recent gift events</h3>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        <p className="muted">
          Loaded on open and updated live when webhooks insert rows. Use Refresh after a Throne
          test if nothing appears.
        </p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : events.length === 0 ? (
          <p className="muted">No webhook events received yet.</p>
        ) : (
          <ul className="admin-library">
            {events.map((ev) => {
              const payloadPreview = formatThronePayloadPreview(ev.payload);
              return (
              <li key={ev.id} className="admin-library-item">
                <strong className="admin-library-item__title">
                  {formatThroneEventSummary(ev)}
                </strong>
                <span className="admin-library-item__meta muted">
                  {new Date(ev.receivedAt).toLocaleString()}
                  {ev.eventType !== 'gift' ? ` · ${ev.eventType}` : ''}
                  {ev.matchedUserId ? ' · Matched to pending payment' : ' · No match'}
                </span>
                {payloadPreview ? (
                  <span className="admin-library-item__meta muted throne-event-payload">
                    {payloadPreview}
                  </span>
                ) : null}
              </li>
            );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function TrainingProofsAdmin() {
  const { session } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<TrainingProofSubmission[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchPendingProofSubmissions();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);

    const profilesResult = await fetchAdminProfiles();
    const usernameById = new Map<string, string>();
    if (profilesResult.ok) {
      for (const p of profilesResult.profiles) {
        usernameById.set(p.id, p.username);
      }
    }
    setSubmissions(
      result.submissions.map((sub) => ({
        ...sub,
        username: usernameById.get(sub.userId) ?? sub.userId.slice(0, 8),
      })),
    );

    const urls: Record<string, string> = {};
    await Promise.all(
      result.submissions.map(async (sub) => {
        const urlResult = await getTrainingProofPhotoUrl(sub.proofPhotoPath);
        if (urlResult.ok) urls[sub.completionId] = urlResult.url;
      }),
    );
    setPhotoUrls(urls);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVerify = async (
    completionId: string,
    status: 'approved' | 'rejected',
  ) => {
    if (!session?.userId) return;
    setActingId(completionId);
    setMessage(null);
    const result = await verifyTrainingProof(completionId, session.userId, status);
    setActingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`Proof ${status}.`);
    await load();
  };

  return (
    <section className="card">
      <h3 className="section-title">Pending proof verifications</h3>
      <p className="muted">
        Review proof photos submitted by users with Blackmail enabled.
      </p>
      {message && (
        <p className="notice admin-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : submissions.length === 0 ? (
        <p className="muted">No pending proofs.</p>
      ) : (
        <ul className="training-proof-admin-list">
          {submissions.map((sub) => (
            <li key={sub.completionId} className="training-proof-admin-item card">
              <div className="training-proof-admin-item__meta">
                <strong>{sub.username}</strong>
                <span className="muted"> · {sub.taskTitle}</span>
                <span className="muted"> · {new Date(sub.completedAt).toLocaleString()}</span>
              </div>
              {photoUrls[sub.completionId] ? (
                <img
                  src={photoUrls[sub.completionId]}
                  alt={`Proof from ${sub.username}`}
                  className="training-proof-admin-item__photo"
                />
              ) : (
                <p className="muted">Loading photo…</p>
              )}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={actingId === sub.completionId}
                  onClick={() => void handleVerify(sub.completionId, 'approved')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small btn--danger-text"
                  disabled={actingId === sub.completionId}
                  onClick={() => void handleVerify(sub.completionId, 'rejected')}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
