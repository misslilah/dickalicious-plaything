import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [selectedIds, setSelectedIds] = useState<string[]>(initialVideoIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(playlist?.title ?? '');
    setSelectedIds(initialVideoIds);
  }, [playlist?.id, playlist?.title, initialVideoIds]);

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

  const toggleId = useCallback((videoId: string, locked: boolean) => {
    if (locked) return;
    setSelectedIds((prev) =>
      prev.includes(videoId)
        ? prev.filter((id) => id !== videoId)
        : [...prev, videoId],
    );
  }, []);

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

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      let playlistId = playlist?.id;
      if (!playlistId) {
        const created = await createVideoPlaylist(title, type);
        if (!created.ok) {
          setError(created.error);
          return;
        }
        playlistId = created.playlist.id;
      } else {
        const updated = await updateVideoPlaylistTitle(playlistId, title);
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

        <label className="video-playlist-manager__field">
          <span className="muted">Playlist name</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My playlist"
            maxLength={120}
          />
        </label>

        <p className="muted video-playlist-manager__hint">
          Add videos in play order. Locked videos cannot be added.
        </p>

        {type === 'normal' ? (
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
                      onChange={() => toggleId(video.id, locked)}
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
                      onChange={() => toggleId(video.id, false)}
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
        )}

        {selectedIds.length > 0 && (
          <section className="video-playlist-manager__order">
            <h4 className="section-title">Play order</h4>
            <ol className="video-playlist-manager__order-list">
              {selectedIds.map((id, index) => (
                <li key={id}>
                  <span className="video-playlist-manager__order-index">{index + 1}</span>
                  <span>{selectedLabels[index]}</span>
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

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <div className="video-playlist-manager__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void handleSave()}
            disabled={saving || !title.trim() || selectedIds.length === 0}
          >
            {saving ? 'Saving…' : 'Save playlist'}
          </button>
        </div>
      </div>
    </div>
  );
}
