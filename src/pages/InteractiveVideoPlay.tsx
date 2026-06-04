import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useOptionalVideoPlayer } from '../contexts/VideoPlayerProvider';
import { useVideoPlaylistPlayback } from '../contexts/VideoPlaylistPlaybackContext';
import { InteractiveVideoPlayer } from '../components/InteractiveVideoPlayer';
import { fetchInteractiveVideo, type InteractiveVideo } from '../lib/interactiveVideos';
import {
  fetchUserVideoPlaylists,
  videoIdsForPlaylist,
} from '../lib/videoPlaylistDb';

export function InteractiveVideoPlay() {
  const audio = useOptionalAudioPlayer();
  const globalVideo = useOptionalVideoPlayer();
  const playlistCtx = useVideoPlaylistPlayback();
  const navigate = useNavigate();
  const { videoId } = useParams<{ videoId: string }>();
  const [searchParams] = useSearchParams();
  const playlistParam = searchParams.get('playlist');
  const [video, setVideo] = useState<InteractiveVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const advancingRef = useRef(false);

  useEffect(() => {
    audio?.pausePlayback();
    globalVideo?.clearNormalPlayback();
  }, [videoId, audio, globalVideo]);

  useEffect(() => {
    if (!playlistParam || playlistCtx.active?.playlistId === playlistParam) return;
    void (async () => {
      const result = await fetchUserVideoPlaylists('interactive');
      if (!result.ok) return;
      const playlist = result.library.playlists.find((p) => p.id === playlistParam);
      if (!playlist) return;
      const ids = videoIdsForPlaylist(playlist.id, result.library.items);
      if (ids.length === 0) return;
      const startIndex = videoId ? Math.max(0, ids.indexOf(videoId)) : 0;
      playlistCtx.startPlaylist({
        playlistId: playlist.id,
        title: playlist.title,
        type: 'interactive',
        videoIds: ids,
        startIndex: startIndex >= 0 ? startIndex : 0,
      });
    })();
  }, [playlistParam, videoId, playlistCtx.active?.playlistId, playlistCtx.startPlaylist]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setVideo(null);
    advancingRef.current = false;

    if (!videoId) {
      setLoading(false);
      setError('Video not found.');
      return;
    }

    void fetchInteractiveVideo(videoId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVideo(result.video);
    });

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const exitPlaylist = useCallback(() => {
    playlistCtx.exitPlaylist();
    navigate('/videos');
  }, [playlistCtx, navigate]);

  const handleSessionComplete = useCallback(() => {
    if (advancingRef.current) return;
    const active = playlistCtx.active;
    if (!active || active.type !== 'interactive') return;

    const isLast = active.index >= active.videoIds.length - 1;
    if (isLast) {
      playlistCtx.exitPlaylist();
      return;
    }

    advancingRef.current = true;
    playlistCtx.advanceInteractivePlaylist();
  }, [playlistCtx]);

  const playlistProgress =
    playlistCtx.active?.type === 'interactive' ? playlistCtx.progress : null;

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading interactive video…</p>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="page">
        <p className="login-error" role="alert">
          {error || 'Video not found.'}
        </p>
        <Link to="/videos/interactive" className="btn btn--ghost">
          Back to interactive videos
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <InteractiveVideoPlayer
        key={video.id}
        video={video}
        onSessionComplete={handleSessionComplete}
        playlistProgress={playlistProgress}
        onExitPlaylist={playlistCtx.active ? exitPlaylist : undefined}
      />
    </div>
  );
}
