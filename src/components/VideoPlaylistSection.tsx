import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import { useVideoPlayer } from '../contexts/VideoPlayerProvider';
import { useVideoPlaylistPlayback } from '../contexts/VideoPlaylistPlaybackContext';
import {
  fetchInteractiveVideoSummaries,
  type InteractiveVideoSummary,
} from '../lib/interactiveVideos';
import {
  canWatchVideo,
  type VideoAccessContext,
} from '../lib/videoAccess';
import {
  deleteVideoPlaylist,
  fetchUserVideoPlaylists,
  itemsForVideoPlaylist,
  videoIdsForPlaylist,
  type VideoPlaylistLibrary,
} from '../lib/videoPlaylistDb';
import type { Video, VideoPlaylist, VideoPlaylistType } from '../types';
import { VideoPlaylistManager } from './VideoPlaylistManager';

/** Stable empty array for create-mode initial ids (avoids prop reference churn). */
const EMPTY_MANAGER_IDS: string[] = [];

interface VideoPlaylistSectionProps {
  type: VideoPlaylistType;
}

export function VideoPlaylistSection({ type }: VideoPlaylistSectionProps) {
  const navigate = useNavigate();
  const { state, session } = useAppStore();
  const videoPlayer = useVideoPlayer();
  const playlistPlayback = useVideoPlaylistPlayback();
  const isAdmin = session?.role === 'admin';

  const [library, setLibrary] = useState<VideoPlaylistLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managerPlaylist, setManagerPlaylist] = useState<VideoPlaylist | null | 'new'>(
    null,
  );
  const [interactiveCatalog, setInteractiveCatalog] = useState<
    InteractiveVideoSummary[]
  >([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchUserVideoPlaylists(type);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setLibrary(null);
      return;
    }
    setLibrary(result.library);
  }, [type]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (type !== 'interactive') return;
    void fetchInteractiveVideoSummaries().then((result) => {
      if (result.ok) setInteractiveCatalog(result.videos);
    });
  }, [type]);

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

  const categoriesById = useMemo(
    () => new Map(state.videoCategories.map((c) => [c.id, c])),
    [state.videoCategories],
  );

  const resolveAccessibleVideoIds = useCallback(
    (videoIds: string[]): string[] => {
      if (type === 'interactive') {
        const published = new Set(interactiveCatalog.map((v) => v.id));
        return videoIds.filter((id) => published.has(id));
      }
      return videoIds.filter((id) => {
        const video = state.videos.find((v) => v.id === id);
        if (!video) return false;
        const category = categoriesById.get(video.categoryId);
        return canWatchVideo(video, category, videoAccessCtx);
      });
    },
    [
      type,
      interactiveCatalog,
      state.videos,
      categoriesById,
      videoAccessCtx,
    ],
  );

  const buildNormalEntries = useCallback(
    (videoIds: string[]) => {
      const entries: { video: Video; categoryId: string }[] = [];
      for (const id of videoIds) {
        const video = state.videos.find((v) => v.id === id);
        if (!video) continue;
        const category = categoriesById.get(video.categoryId);
        if (!canWatchVideo(video, category, videoAccessCtx)) continue;
        entries.push({ video, categoryId: video.categoryId });
      }
      return entries;
    },
    [state.videos, categoriesById, videoAccessCtx],
  );

  const playPlaylist = useCallback(
    (playlist: VideoPlaylist) => {
      if (!library) return;
      const rawIds = videoIdsForPlaylist(playlist.id, library.items);
      const accessibleIds = resolveAccessibleVideoIds(rawIds);
      if (accessibleIds.length === 0) return;

      if (type === 'normal') {
        const entries = buildNormalEntries(accessibleIds);
        if (entries.length === 0) return;
        playlistPlayback.startPlaylist({
          playlistId: playlist.id,
          title: playlist.title,
          type: 'normal',
          videoIds: accessibleIds,
        });
        videoPlayer.startPlaylistPlayback({
          playlistId: playlist.id,
          title: playlist.title,
          entries,
          index: 0,
        });
        navigate(`/videos/playlist/${playlist.id}`);
        return;
      }

      playlistPlayback.startPlaylist({
        playlistId: playlist.id,
        title: playlist.title,
        type: 'interactive',
        videoIds: accessibleIds,
      });
      navigate(
        `/videos/interactive/${accessibleIds[0]}?playlist=${playlist.id}`,
      );
    },
    [
      library,
      type,
      resolveAccessibleVideoIds,
      buildNormalEntries,
      playlistPlayback,
      videoPlayer,
      navigate,
    ],
  );

  const handleDelete = async (playlistId: string) => {
    const confirmed = window.confirm('Delete this playlist?');
    if (!confirmed) return;
    const result = await deleteVideoPlaylist(playlistId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (playlistPlayback.active?.playlistId === playlistId) {
      playlistPlayback.exitPlaylist();
      videoPlayer.exitPlaylistPlayback();
    }
    await reload();
  };

  const managerInitialIds = useMemo(() => {
    if (!managerPlaylist || managerPlaylist === 'new') return EMPTY_MANAGER_IDS;
    return videoIdsForPlaylist(managerPlaylist.id, library?.items ?? []);
  }, [managerPlaylist, library?.items]);

  const managerKey =
    managerPlaylist == null
      ? null
      : managerPlaylist === 'new'
        ? 'new'
        : managerPlaylist.id;

  const managerDialog =
    managerKey != null ? (
      <VideoPlaylistManager
        key={managerKey}
        type={type}
        playlist={managerPlaylist === 'new' ? null : managerPlaylist}
        initialVideoIds={managerInitialIds}
        interactiveCatalog={interactiveCatalog}
        onClose={() => setManagerPlaylist(null)}
        onSaved={() => void reload()}
      />
    ) : null;

  if (loading) {
    return (
      <>
        <section className="card video-playlist-section">
          <p className="muted">Loading your playlists…</p>
        </section>
        {managerDialog}
      </>
    );
  }

  if (error) {
    return (
      <>
        <section className="card video-playlist-section">
          <p className="login-error" role="alert">
            {error}
          </p>
        </section>
        {managerDialog}
      </>
    );
  }

  const playlists = library?.playlists ?? [];
  const items = library?.items ?? [];

  return (
    <section className="video-playlist-section">
      <div className="video-playlist-section__header">
        <h3 className="section-title">
          {type === 'normal' ? 'Video playlists' : 'Interactive playlists'}
        </h3>
        <button
          type="button"
          className="btn btn--primary btn--small"
          onClick={() => setManagerPlaylist('new')}
        >
          Create playlist
        </button>
      </div>

      <p className="muted audio-playlist__intro">
        Build a personal playlist — videos play one after another in order.
      </p>

      {playlists.length === 0 ? (
        <section className="card">
          <p className="muted">
            No playlists yet. Tap <strong>Create playlist</strong> to pick videos from
            the catalog.
          </p>
        </section>
      ) : (
        <ul className="audio-playlist__catalog">
          {playlists.map((pl) => {
            const plItems = itemsForVideoPlaylist(pl.id, items);
            const accessibleCount = resolveAccessibleVideoIds(
              plItems.map((i) => i.videoId),
            ).length;

            return (
              <li key={pl.id}>
                <article className="audio-playlist__catalog-card card video-playlist-section__card">
                  <div className="audio-playlist__catalog-main">
                    <span className="audio-playlist__catalog-icon" aria-hidden>
                      {type === 'normal' ? '🎬' : '📷'}
                    </span>
                    <div className="audio-playlist__catalog-meta">
                      <strong>{pl.title}</strong>
                      <span className="muted">
                        {plItems.length} video{plItems.length === 1 ? '' : 's'}
                        {accessibleCount < plItems.length
                          ? ` · ${accessibleCount} available`
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div className="video-playlist-section__card-actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      disabled={accessibleCount === 0}
                      onClick={() => playPlaylist(pl)}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => setManagerPlaylist(pl)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => void handleDelete(pl.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {type === 'normal' && (
        <p className="muted video-playlist-section__foot">
          <Link to="/videos">Browse categories</Link> to discover more videos.
        </p>
      )}

      {managerDialog}
    </section>
  );
}
