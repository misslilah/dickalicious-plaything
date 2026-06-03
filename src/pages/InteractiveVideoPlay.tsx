import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useOptionalVideoPlayer } from '../contexts/VideoPlayerProvider';
import { InteractiveVideoPlayer } from '../components/InteractiveVideoPlayer';
import { fetchInteractiveVideo, type InteractiveVideo } from '../lib/interactiveVideos';

export function InteractiveVideoPlay() {
  const audio = useOptionalAudioPlayer();
  const globalVideo = useOptionalVideoPlayer();
  const { videoId } = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<InteractiveVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    audio?.pausePlayback();
    globalVideo?.clearNormalPlayback();
  }, [videoId, audio, globalVideo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setVideo(null);

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
      <InteractiveVideoPlayer key={video.id} video={video} />
    </div>
  );
}
