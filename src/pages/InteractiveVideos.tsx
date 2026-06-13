import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TierBadge } from '../components/TierBadge';
import { VideoPlaylistSection } from '../components/VideoPlaylistSection';
import { useAppStore } from '../hooks/useAppStore';
import { formatDuration } from '../lib/formatDuration';
import {
  fetchInteractiveVideoSummaries,
  type InteractiveVideoSummary,
} from '../lib/interactiveVideos';
import { requiresTierMessage } from '../lib/tiers';
import {
  canWatchInteractiveVideo,
  interactiveVideoRequiredTier,
  type VideoAccessContext,
} from '../lib/videoAccess';

interface InteractiveVideosProps {
  embedded?: boolean;
}

export function InteractiveVideos({ embedded = false }: InteractiveVideosProps) {
  const { effectiveSession, isEffectiveAdmin } = useAppStore();
  const [videos, setVideos] = useState<InteractiveVideoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const videoAccessCtx: VideoAccessContext = useMemo(
    () => ({
      patreonTier: effectiveSession?.patreonTier,
      patreonStatus: effectiveSession?.patreonStatus,
      isAdmin: isEffectiveAdmin,
      purchasedVideoIds: [],
    }),
    [
      effectiveSession?.patreonTier,
      effectiveSession?.patreonStatus,
      isEffectiveAdmin,
    ],
  );

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
          {videos.map((video) => {
            const locked = !canWatchInteractiveVideo(video, videoAccessCtx);
            const requiredTier = interactiveVideoRequiredTier(video);

            if (locked) {
              return (
                <li key={video.id}>
                  <div
                    className="interactive-videos__card interactive-videos__card--locked card"
                    aria-disabled="true"
                  >
                    <h3>{video.title}</h3>
                    <p className="interactive-videos__meta muted">
                      <span aria-hidden>🔒 </span>
                      {requiresTierMessage(requiredTier)}
                    </p>
                    <p className="video-meta-badges">
                      <TierBadge tier={requiredTier} accessStyle />
                      {video.durationSeconds != null && (
                        <span className="video-list-item__duration" aria-label="Duration">
                          {formatDuration(video.durationSeconds)}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            }

            return (
              <li key={video.id}>
                <Link to={`/videos/interactive/${video.id}`} className="interactive-videos__card card">
                  <h3>{video.title}</h3>
                  {video.description && <p className="muted">{video.description}</p>}
                  <p className="interactive-videos__meta muted">
                    {video.cueCount} cue{video.cueCount === 1 ? '' : 's'}
                    {video.durationSeconds != null &&
                      ` · ${formatDuration(video.durationSeconds)}`}
                  </p>
                  <p className="video-meta-badges">
                    <TierBadge tier={requiredTier} accessStyle />
                  </p>
                </Link>
              </li>
            );
          })}
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
