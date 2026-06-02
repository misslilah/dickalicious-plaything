import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CUE_COMMAND_LABELS,
  createInteractiveVideo,
  deleteInteractiveVideo,
  fetchAllInteractiveVideos,
  getInteractiveVideoPlaybackUrl,
  replaceInteractiveVideoCues,
  updateInteractiveVideo,
  type InteractiveCueCommand,
  type InteractiveCueInput,
  type InteractiveVideo,
  type InteractiveVideoInput,
} from '../../lib/interactiveVideos';
import { formatMb, formatVideoSizeError, MAX_VIDEO_SIZE_LABEL } from '../../lib/videoStorage';

type DraftCue = InteractiveCueInput & { localId: string };

function blankForm(): InteractiveVideoInput {
  return { title: '', description: '', durationSeconds: null };
}

function newDraftCue(timeMs: number): DraftCue {
  return {
    localId: crypto.randomUUID(),
    timeMs,
    commandType: 'mouth_open',
    persistent: false,
  };
}

function formatTimeInput(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1);
  return `${min}:${sec.padStart(4, '0')}`;
}

function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const [minPart, secPart] = trimmed.split(':');
    const min = Number(minPart);
    const sec = Number(secPart);
    if (!Number.isFinite(min) || !Number.isFinite(sec)) return null;
    return Math.max(0, (min * 60 + sec) * 1000);
  }
  const sec = Number(trimmed);
  if (!Number.isFinite(sec)) return null;
  return Math.max(0, sec * 1000);
}

export function InteractiveVideoAdmin() {
  const previewRef = useRef<HTMLVideoElement>(null);
  const [videos, setVideos] = useState<InteractiveVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const [videoFile, setVideoFile] = useState<File | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draftCues, setDraftCues] = useState<DraftCue[]>([]);
  const [scrubMs, setScrubMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.description ?? '').toLowerCase().includes(q),
    );
  }, [videos, search]);

  const loadVideos = async () => {
    setLoading(true);
    setError('');
    const result = await fetchAllInteractiveVideos();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setVideos(result.videos);
  };

  useEffect(() => {
    void loadVideos();
  }, []);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    if (editingId) {
      const existing = videos.find((v) => v.id === editingId);
      if (existing) {
        void getInteractiveVideoPlaybackUrl(existing.storagePath).then((r) => {
          if (r.ok) setPreviewUrl(r.url);
        });
      }
    } else {
      setPreviewUrl(null);
    }
    return undefined;
  }, [videoFile, editingId, videos]);

  const resetForm = () => {
    setEditingId(null);
    setForm(blankForm());
    setVideoFile(undefined);
    setPreviewUrl(null);
    setDraftCues([]);
    setScrubMs(0);
    setDurationMs(0);
  };

  const startEdit = (video: InteractiveVideo) => {
    setEditingId(video.id);
    setForm({
      title: video.title,
      description: video.description ?? '',
      durationSeconds: video.durationSeconds,
    });
    setVideoFile(undefined);
    setDraftCues(
      video.cues.map((c) => ({
        localId: c.id,
        timeMs: c.timeMs,
        commandType: c.commandType,
        persistent: c.persistent,
        sortOrder: c.sortOrder,
      })),
    );
    setMessage('');
    setError('');
  };

  const onVideoMetadata = () => {
    const el = previewRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    const ms = el.duration * 1000;
    setDurationMs(ms);
    setForm((prev) => ({
      ...prev,
      durationSeconds: el.duration,
    }));
  };

  const onScrub = (ms: number) => {
    setScrubMs(ms);
    const el = previewRef.current;
    if (el) el.currentTime = ms / 1000;
  };

  const addCueAtScrub = () => {
    setDraftCues((prev) =>
      [...prev, newDraftCue(scrubMs)].sort((a, b) => a.timeMs - b.timeMs),
    );
  };

  const updateDraftCue = (localId: string, patch: Partial<DraftCue>) => {
    setDraftCues((prev) =>
      prev
        .map((c) => (c.localId === localId ? { ...c, ...patch } : c))
        .sort((a, b) => a.timeMs - b.timeMs),
    );
  };

  const removeDraftCue = (localId: string) => {
    setDraftCues((prev) => prev.filter((c) => c.localId !== localId));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    const input: InteractiveVideoInput = {
      title: form.title,
      description: form.description?.trim() ? form.description : null,
      durationSeconds: form.durationSeconds,
    };

    if (editingId) {
      const result = await updateInteractiveVideo(editingId, input, {
        file: videoFile,
      });
      if (!result.ok) {
        setSaving(false);
        setError(result.error);
        return;
      }
      const cuesResult = await replaceInteractiveVideoCues(
        editingId,
        draftCues.map(({ localId: _id, ...cue }) => cue),
      );
      setSaving(false);
      if (!cuesResult.ok) {
        setError(cuesResult.error);
        return;
      }
      setMessage('Interactive video updated.');
      resetForm();
      await loadVideos();
      return;
    }

    if (!videoFile) {
      setSaving(false);
      setError('Choose a video file.');
      return;
    }
    if (videoFile.size > 2 * 1024 * 1024 * 1024) {
      setSaving(false);
      setError(formatVideoSizeError(videoFile.size));
      return;
    }

    const created = await createInteractiveVideo(input, videoFile);
    if (!created.ok) {
      setSaving(false);
      setError(created.error);
      return;
    }

    if (draftCues.length > 0) {
      const cuesResult = await replaceInteractiveVideoCues(
        created.video.id,
        draftCues.map(({ localId: _id, ...cue }) => cue),
      );
      if (!cuesResult.ok) {
        setSaving(false);
        setError(cuesResult.error);
        return;
      }
    }

    setSaving(false);
    setMessage(`Interactive video uploaded (${formatMb(videoFile.size)}).`);
    resetForm();
    await loadVideos();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this interactive video and all its cues?')) return;
    const result = await deleteInteractiveVideo(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Interactive video deleted.');
    if (editingId === id) resetForm();
    await loadVideos();
  };

  const timelinePercent = durationMs > 0 ? (scrubMs / durationMs) * 100 : 0;

  return (
    <div className="interactive-video-admin">
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="admin-message">{message}</p>}

      <div className="filters">
        <input
          type="search"
          placeholder="Search interactive videos…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search interactive videos"
        />
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No interactive videos yet.</p>
      ) : (
        <ul className="admin-list">
          {filtered.map((video) => (
            <li key={video.id} className="admin-list__item">
              <div>
                <strong>{video.title}</strong>
                <span className="muted">
                  {' '}
                  · {video.cues.length} cue{video.cues.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="admin-list__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEdit(video)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm btn--danger"
                  onClick={() => void handleDelete(video.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="card interactive-video-admin__form">
        <h3>{editingId ? 'Edit interactive video' : 'Upload interactive video'}</h3>

        <label className="field">
          <span className="field__label">Title</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
        </label>

        <label className="field">
          <span className="field__label">Description</span>
          <textarea
            value={form.description ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            rows={2}
          />
        </label>

        <label className="field">
          <span className="field__label">Video file</span>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setVideoFile(e.target.files?.[0])}
          />
          <span className="field__hint">accept video/* · max {MAX_VIDEO_SIZE_LABEL}</span>
        </label>

        {previewUrl && (
          <div className="interactive-video-admin__editor">
            <video
              ref={previewRef}
              src={previewUrl}
              className="interactive-video-admin__preview"
              controls
              playsInline
              onLoadedMetadata={onVideoMetadata}
              onTimeUpdate={() => {
                const el = previewRef.current;
                if (el) setScrubMs(el.currentTime * 1000);
              }}
            />

            <div className="interactive-video-admin__timeline">
              <label className="field">
                <span className="field__label">
                  Scrubber {durationMs > 0 ? formatTimeInput(scrubMs) : '—'}
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(durationMs, 1)}
                  step={100}
                  value={scrubMs}
                  onChange={(e) => onScrub(Number(e.target.value))}
                  disabled={durationMs <= 0}
                />
              </label>

              <div
                className="interactive-video-admin__track"
                onClick={(e) => {
                  if (durationMs <= 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / rect.width;
                  onScrub(Math.max(0, Math.min(durationMs, ratio * durationMs)));
                }}
                role="presentation"
              >
                <div
                  className="interactive-video-admin__playhead"
                  style={{ left: `${timelinePercent}%` }}
                />
                {draftCues.map((cue) => (
                  <button
                    key={cue.localId}
                    type="button"
                    className="interactive-video-admin__marker"
                    style={{
                      left: `${durationMs > 0 ? (cue.timeMs / durationMs) * 100 : 0}%`,
                    }}
                    title={`${formatTimeInput(cue.timeMs)} — ${CUE_COMMAND_LABELS[cue.commandType]}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onScrub(cue.timeMs);
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={durationMs <= 0}
                onClick={addCueAtScrub}
              >
                Add cue at {formatTimeInput(scrubMs)}
              </button>
            </div>

            {draftCues.length > 0 && (
              <ul className="interactive-video-admin__cue-list">
                {draftCues.map((cue) => (
                  <li key={cue.localId} className="interactive-video-admin__cue-row">
                    <input
                      type="text"
                      className="interactive-video-admin__time-input"
                      defaultValue={formatTimeInput(cue.timeMs)}
                      onBlur={(e) => {
                        const ms = parseTimeInput(e.target.value);
                        if (ms !== null) updateDraftCue(cue.localId, { timeMs: ms });
                        else e.target.value = formatTimeInput(cue.timeMs);
                      }}
                    />
                    <select
                      value={cue.commandType}
                      onChange={(e) =>
                        updateDraftCue(cue.localId, {
                          commandType: e.target.value as InteractiveCueCommand,
                        })
                      }
                    >
                      {(Object.keys(CUE_COMMAND_LABELS) as InteractiveCueCommand[]).map((key) => (
                        <option key={key} value={key}>
                          {CUE_COMMAND_LABELS[key]}
                        </option>
                      ))}
                    </select>
                    <label className="interactive-video-admin__persistent">
                      <input
                        type="checkbox"
                        checked={cue.persistent}
                        onChange={(e) =>
                          updateDraftCue(cue.localId, { persistent: e.target.checked })
                        }
                      />
                      Persistent
                    </label>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--danger"
                      onClick={() => removeDraftCue(cue.localId)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="interactive-video-admin__actions">
          <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Upload'}
          </button>
          {editingId && (
            <button type="button" className="btn btn--ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
