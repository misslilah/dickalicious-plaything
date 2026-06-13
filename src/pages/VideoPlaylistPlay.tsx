import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NormalVideoPlayerSurface } from '../components/NormalVideoPlayerSurface';
import { VideoPlaylistProgressBanner } from '../components/VideoPlaylistProgressBanner';
import { useVideoPlayer } from '../contexts/VideoPlayerProvider';
import { useVideoPlaylistPlayback } from '../contexts/VideoPlaylistPlaybackContext';
import { useAppStore } from '../hooks/useAppStore';
import {
  canWatchVideo,
  type VideoAccessContext,
} from '../lib/videoAccess';
import {
  fetchUserVideoPlaylists,
  itemsForVideoPlaylist,
  videoIdsForPlaylist,
} from '../lib/videoPlaylistDb';

export function VideoPlaylistPlay() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const { state, effectiveSession, isEffectiveAdmin } = useAppStore();
  const videoPlayer = useVideoPlayer();
  const playlistCtx = useVideoPlaylistPlayback();
  const isAdmin = isEffectiveAdmin;
  const [loadError, setLoadError] = useState<string | null>(null);

  const videoAccessCtx: VideoAccessContext = useMemo(
    () => ({
      patreonTier: effectiveSession?.patreonTier,
      patreonStatus: effectiveSession?.patreonStatus,
      isAdmin,
      purchasedVideoIds: state.purchasedVideoIds,
    }),
    [
      effectiveSession?.patreonTier,
      effectiveSession?.patreonStatus,
      isAdmin,
      state.purchasedVideoIds,
    ],
  );

  const categoriesById = useMemo(
    () => new Map(state.videoCategories.map((c) => [c.id, c])),
    [state.videoCategories],
  );

  const startFromCatalog = useCallback(async () => {
    if (!playlistId) {
      setLoadError('Playlist not found.');
      return;
    }
    const result = await fetchUserVideoPlaylists('normal');
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    const playlist = result.library.playlists.find((p) => p.id === playlistId);
    if (!playlist || playlist.type !== 'normal') {
      setLoadError('Playlist not found.');
      return;
    }
    const rawIds = videoIdsForPlaylist(playlistId, result.library.items);
    const entries = rawIds
      .map((id) => state.videos.find((v) => v.id === id))
      .filter((video): video is NonNullable<typeof video> => {
        if (!video) return false;
        const category = categoriesById.get(video.categoryId);
        return canWatchVideo(video, category, videoAccessCtx);
      })
      .map((video) => ({ video, categoryId: video.categoryId }));

    if (entries.length === 0) {
      setLoadError('No accessible videos in this playlist.');
      return;
    }

    const videoIds = entries.map((e) => e.video.id);
    playlistCtx.startPlaylist({
      playlistId: playlist.id,
      title: playlist.title,
      type: 'normal',
      videoIds,
    });
    videoPlayer.startPlaylistPlayback({
      playlistId: playlist.id,
      title: playlist.title,
      entries,
      index: 0,
    });
    setLoadError(null);
  }, [
    playlistId,
    state.videos,
    categoriesById,
    videoAccessCtx,
    playlistCtx,
    videoPlayer,
  ]);

  useEffect(() => {
    if (videoPlayer.playlistPlayback?.playlistId === playlistId) return;
    void startFromCatalog();
  }, [playlistId, videoPlayer.playlistPlayback?.playlistId, startFromCatalog]);

  useEffect(() => {
    const progress = videoPlayer.playlistProgress;
    if (!progress || !playlistCtx.active) return;
    playlistCtx.setPlaylistIndex(progress.current - 1);
  }, [videoPlayer.playlistProgress, playlistCtx]);

  const exitPlaylist = useCallback(() => {
    playlistCtx.exitPlaylist();
    videoPlayer.exitPlaylistPlayback();
    navigate('/videos');
  }, [playlistCtx, videoPlayer, navigate]);

  const progress =
    videoPlayer.playlistProgress ?? playlistCtx.progress ?? null;
  const sessionTitle = videoPlayer.playlistPlayback?.title ?? playlistCtx.active?.title;

  if (loadError) {
    return (
      <div className="page">
        <p className="login-error" role="alert">
          {loadError}
        </p>
        <Link to="/videos" className="btn btn--ghost">
          Back to Videos
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="muted">
          <Link to="/videos">← Media</Link>
        </p>
        <h2>{sessionTitle ?? 'Playlist'}</h2>
      </header>

      {progress && sessionTitle && (
        <VideoPlaylistProgressBanner
          title={sessionTitle}
          current={progress.current}
          total={progress.total}
          onExit={exitPlaylist}
        />
      )}

      <section className="card video-watch-card">
        {videoPlayer.session ? (
          <>
            <h3 className="section-title">{videoPlayer.session.title}</h3>
            <NormalVideoPlayerSurface />
          </>
        ) : (
          <p className="muted">Starting playlist…</p>
        )}
      </section>
    </div>
  );
}
