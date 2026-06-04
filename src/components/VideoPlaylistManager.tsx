import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import {
  canWatchVideo,
  type VideoAccessContext,
} from '../lib/videoAccess';
import {
  createVideoPlaylist,
  replaceVideoPlaylistItems,
  updateVideoPlaylistTitle,
} from '../lib/videoPlaylistDb';
import { formatDuration } from '../lib/formatDuration';
import type { InteractiveVideoSummary } from '../lib/interactiveVideos';
import type { VideoPlaylist, VideoPlaylistType } from '../types';

interface VideoPlaylistManagerProps {
  type: VideoPlaylistType;
  playlist: VideoPlaylist | null;
  initialVideoIds: string[];
  interactiveCatalog: InteractiveVideoSummary[];
  onClose: () => void;
  onSaved: () => void;
}

export function VideoPlaylistManager({
  type,
  playlist,
  initialVideoIds,
  interactiveCatalog,
  onClose,
  onSaved,
}: VideoPlaylistManagerProps) {
  const { state, session } = useAppStore();
  const isAdmin = session?.role === 'admin';
  const [title, setTitle] = useState(playlist?.title ?? '');
  const [titleTouched, setTitleTouched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialVideoIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoAccessCtx: VideoAccessContext = useMemo(
    () => ({
      patreonTier: session?.patreonTier,
      patreonStatus: session?.patreonStatus,
      isAdmin,
      purchasedVideoIds: state.purchasedVideoIds,
    }),
    [
      session?.patreonTier,
      session?.patreonStatus,
      isAdmin,
      state.purchasedVideoIds,
    ],
  );

  const normalCatalog = useMemo(() => {
    const categoriesById = new Map(state.videoCategories.map((c) => [c.id, c]));
    return [...state.videos]
      .map((video) => {
        const category = categoriesById.get(video.categoryId);
        const locked = !canWatchVideo(video, category, videoAccessCtx);
        return { video, category, locked };
      })
      .sort((a, b) => a.video.title.localeCompare(b.video.title));
  }, [state.videos, state.videoCategories, videoAccessCtx]);

  const setVideoSelected = useCallback(
    (videoId: string, selected: boolean, locked: boolean) => {
      if (locked) return;
      setSelectedIds((prev) => {
        const has = prev.includes(videoId);
        if (selected && !has) return [...prev, videoId];
        if (!selected && has) return prev.filter((id) => id !== videoId);
        return prev;
      });
    },
    [],
  );

  const moveSelected = useCallback((videoId: string, direction: -1 | 1) => {
    setSelectedIds((prev) => {
      const index = prev.indexOf(videoId);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }, []);

  const trimmedTitle = title.trim();
  const hasTitle = trimmedTitle.length > 0;
  const hasVideos = selectedIds.length > 0;
  const canSave = !saving && hasTitle && hasVideos;
  const showTitleError = !hasTitle && (titleTouched || hasVideos);
  const saveBlockers: string[] = [];
  if (!hasTitle) saveBlockers.push('Enter a playlist name');
  if (!hasVideos) saveBlockers.push('Select at least one video');

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      let playlistId = playlist?.id;
      if (!playlistId) {
        const created = await createVideoPlaylist(trimmedTitle, type);
        if (!created.ok) {
          setError(created.error);
          return;
        }
        playlistId = created.playlist.id;
      } else {
        const updated = await updateVideoPlaylistTitle(playlistId, trimmedTitle);
        if (!updated.ok) {
          setError(updated.error);
          return;
        }
      }

      const itemsResult = await replaceVideoPlaylistItems(playlistId, selectedIds);
      if (!itemsResult.ok) {
        setError(itemsResult.error);
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const selectedLabels = useMemo(() => {
    if (type === 'normal') {
      const byId = new Map(state.videos.map((v) => [v.id, v]));
      return selectedIds.map((id) => byId.get(id)?.title ?? id);
    }
    const byId = new Map(interactiveCatalog.map((v) => [v.id, v]));
    return selectedIds.map((id) => byId.get(id)?.title ?? id);
  }, [type, selectedIds, state.videos, interactiveCatalog]);

  const catalogList =
    type === 'normal' ? (
      <ul className="video-playlist-manager__catalog">
        {normalCatalog.length === 0 ? (
          <li className="muted">No videos in the catalog yet.</li>
        ) : (
          normalCatalog.map(({ video, category, locked }) => (
            <li key={video.id}>
              <label
                className={`video-playlist-manager__pick${
                  locked ? ' video-playlist-manager__pick--locked' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(video.id)}
                  disabled={locked}
                  onChange={(e) =>
                    setVideoSelected(video.id, e.target.checked, locked)
                  }
                />
                <span>
                  <strong>{video.title}</strong>
                  <span className="muted">
                    {category?.name ?? 'Uncategorized'}
                    {video.durationSeconds != null &&
                      ` · ${formatDuration(video.durationSeconds)}`}
                    {locked ? ' · Locked' : ''}
                  </span>
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    ) : (
      <ul className="video-playlist-manager__catalog">
        {interactiveCatalog.length === 0 ? (
          <li className="muted">No interactive videos published yet.</li>
        ) : (
          interactiveCatalog.map((video) => (
            <li key={video.id}>
              <label className="video-playlist-manager__pick">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(video.id)}
                  onChange={(e) =>
                    setVideoSelected(video.id, e.target.checked, false)
                  }
                />
                <span>
                  <strong>{video.title}</strong>
                  <span className="muted">
                    {video.cueCount} cue{video.cueCount === 1 ? '' : 's'}
                    {video.durationSeconds != null &&
                      ` · ${formatDuration(video.durationSeconds)}`}
                  </span>
                </span>
              </label>
            </li>
          ))
        )}
      </ul>
    );

  return (
    <div
      className="video-playlist-manager"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-playlist-manager-title"
    >
      <div
        className="audio-playlist__lock-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="video-playlist-manager__panel card">
        <header className="video-playlist-manager__header">
          <h3 id="video-playlist-manager-title" className="section-title">
            {playlist ? 'Edit playlist' : 'Create playlist'}
          </h3>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </header>

        <label
          className={`video-playlist-manager__field${
            showTitleError ? ' video-playlist-manager__field--error' : ''
          }`}
        >
          <span className="muted">Playlist name</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            placeholder="My playlist"
            maxLength={120}
            aria-invalid={showTitleError}
            aria-describedby={
              showTitleError ? 'video-playlist-manager-title-error' : undefined
            }
            autoFocus={!playlist}
          />
          {showTitleError && (
            <span
              id="video-playlist-manager-title-error"
              className="video-playlist-manager__field-error"
              role="alert"
            >
              Enter a playlist name
            </span>
          )}
        </label>

        <p className="muted video-playlist-manager__hint">
          Pick videos below, then set play order. Locked videos cannot be added.
        </p>

        {hasVideos && (
          <p className="video-playlist-manager__selection-count" aria-live="polite">
            {selectedIds.length} video{selectedIds.length === 1 ? '' : 's'} selected
          </p>
        )}

        <div className="video-playlist-manager__body">
          <div className="video-playlist-manager__catalog-wrap">
            <h4 className="video-playlist-manager__subhead">Videos</h4>
            {catalogList}
          </div>

          {hasVideos && (
            <section className="video-playlist-manager__order" aria-label="Play order">
              <h4 className="video-playlist-manager__subhead">Play order</h4>
              <ol className="video-playlist-manager__order-list">
                {selectedIds.map((id, index) => (
                  <li key={id}>
                    <span className="video-playlist-manager__order-index">
                      {index + 1}
                    </span>
                    <span className="video-playlist-manager__order-label">
                      {selectedLabels[index]}
                    </span>
                    <span className="video-playlist-manager__order-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={index === 0}
                        onClick={() => moveSelected(id, -1)}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={index === selectedIds.length - 1}
                        onClick={() => moveSelected(id, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        {!canSave && !saving && saveBlockers.length > 0 && (
          <ul
            id="video-playlist-manager-save-hints"
            className="video-playlist-manager__save-hints"
            aria-live="polite"
          >
            {saveBlockers.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        )}

        <div className="video-playlist-manager__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleSave()}
            disabled={!canSave}
            aria-disabled={!canSave}
            aria-describedby={
              !canSave ? 'video-playlist-manager-save-hints' : undefined
            }
            title={!canSave ? saveBlockers.join(' · ') : undefined}
          >
            {saving ? 'Saving…' : 'Save playlist'}
          </button>
        </div>
      </div>
    </div>
  );
}
