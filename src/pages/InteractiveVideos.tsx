import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchInteractiveVideoSummaries,
  type InteractiveVideoSummary,
} from '../lib/interactiveVideos';
import { VideoPlaylistSection } from '../components/VideoPlaylistSection';

interface InteractiveVideosProps {
  embedded?: boolean;
}

export function InteractiveVideos({ embedded = false }: InteractiveVideosProps) {
  const [videos, setVideos] = useState<InteractiveVideoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchInteractiveVideoSummaries().then((result) => {
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVideos(result.videos);
    });
  }, []);

  const content = (
    <>
      <div className="interactive-videos__warning card" role="note">
        <strong>Camera permission required</strong>
        <p className="muted">
          Interactive playback uses your front camera to detect sniffing, mouth open, and tongue-out
          gestures. Works best on desktop; mobile support is best-effort.
        </p>
      </div>

      <VideoPlaylistSection type="interactive" />

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : videos.length === 0 ? (
        <section className="card">
          <p className="muted">No interactive videos published yet.</p>
        </section>
      ) : (
        <ul className="interactive-videos__list">
          {videos.map((video) => (
            <li key={video.id}>
              <Link to={`/videos/interactive/${video.id}`} className="interactive-videos__card card">
                <h3>{video.title}</h3>
                {video.description && <p className="muted">{video.description}</p>}
                <p className="interactive-videos__meta muted">
                  {video.cueCount} cue{video.cueCount === 1 ? '' : 's'}
                  {video.durationSeconds != null &&
                    ` · ${Math.round(video.durationSeconds)}s`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return <div className="interactive-videos interactive-videos--embedded">{content}</div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/videos" className="btn btn--ghost btn--sm">
          ← Media
        </Link>
        <h2>Interactive Videos</h2>
        <p className="muted">
          Videos that pause at cue points and verify your actions via camera.
        </p>
      </header>
      {content}
    </div>
  );
}
