import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { InteractiveVideoPlayer } from '../components/InteractiveVideoPlayer';
import { fetchInteractiveVideo, type InteractiveVideo } from '../lib/interactiveVideos';

export function InteractiveVideoPlay() {
  const { videoId } = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<InteractiveVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!videoId) {
      setLoading(false);
      setError('Video not found.');
      return;
    }
    void fetchInteractiveVideo(videoId).then((result) => {
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVideo(result.video);
    });
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
      <InteractiveVideoPlayer video={video} />
    </div>
  );
}
