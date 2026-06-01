import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import { useVideoPlaybackUrl } from '../hooks/useVideoBlobUrl';
import { getPatreonPageUrl } from '../lib/patreon';
import { TierBadge } from '../components/TierBadge';
import {
  canAccessTier,
  effectiveVideoTier,
  requiresTierMessage,
} from '../lib/tiers';
import { ForcedModeVideoPlayer } from '../components/ForcedModeVideoPlayer';
import type { ContentTier, Video, VideoCategory } from '../types';

const VIDEO_LOOP_SESSION_KEY = 'video-loop-enabled';

function readLoopPreference(): boolean {
  try {
    return sessionStorage.getItem(VIDEO_LOOP_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeLoopPreference(enabled: boolean): void {
  try {
    sessionStorage.setItem(VIDEO_LOOP_SESSION_KEY, String(enabled));
  } catch {
    // sessionStorage unavailable
  }
}

function TierUpgradeBanner({ requiredTier }: { requiredTier: ContentTier }) {
  const patreonUrl = getPatreonPageUrl();
  return (
    <div className="tier-upgrade-banner" role="alert">
      <p>
        <strong>{requiresTierMessage(requiredTier)}</strong> to watch this video.
      </p>
      <p className="muted">
        Link your Patreon account in Settings or upgrade your membership.
      </p>
      <a
        href={patreonUrl}
        className="btn btn--primary"
        target="_blank"
        rel="noopener noreferrer"
      >
        View Patreon tiers
      </a>
    </div>
  );
}

function VideoPlayer({ video }: { video: Video }) {
  const { url, loading, error } = useVideoPlaybackUrl(video.storagePath);
  const [loop, setLoop] = useState(readLoopPreference);

  const toggleLoop = useCallback(() => {
    setLoop((prev) => {
      const next = !prev;
      writeLoopPreference(next);
      return next;
    });
  }, []);

  if (loading) {
    return <p className="muted">Loading video…</p>;
  }
  if (error || !url) {
    return <p className="login-error">{error ?? 'Video unavailable.'}</p>;
  }

  return (
    <div className="video-player-wrap">
      <video
        className="video-player"
        controls
        loop={loop}
        src={url}
        preload="metadata"
        aria-label={video.title}
      />
      <div className="video-player-controls">
        <button
          type="button"
          className={loop ? 'chip chip--active' : 'chip'}
          aria-pressed={loop}
          onClick={toggleLoop}
        >
          Loop
        </button>
      </div>
    </div>
  );
}

function VideoListItem({
  video,
  category,
  selected,
  locked,
  onSelect,
}: {
  video: Video;
  category: VideoCategory | undefined;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const required = effectiveVideoTier(video.requiredTier, category?.requiredTier);

  return (
    <button
      type="button"
      className={
        selected
          ? 'video-list-item video-list-item--active'
          : locked
            ? 'video-list-item video-list-item--locked'
            : 'video-list-item'
      }
      onClick={onSelect}
      aria-disabled={locked}
    >
      <span className="video-list-item__icon" aria-hidden>
        {locked ? '🔒' : '🎬'}
      </span>
      <span className="video-list-item__body">
        <strong>{video.title}</strong>
        <span className="video-list-item__tier">
          <TierBadge tier={required} accessStyle />
        </span>
        {video.forcedMode && !locked && (
          <span className="video-list-item__forced" aria-label="Forced Mode enabled">
            Forced Mode
          </span>
        )}
        {locked ? (
          <span className="muted video-list-item__desc">
            {requiresTierMessage(required)}
          </span>
        ) : (
          video.description && (
            <span className="muted video-list-item__desc">{video.description}</span>
          )
        )}
      </span>
    </button>
  );
}

export function VideoCategoryDetail() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { state, session } = useAppStore();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [forcedSessionActive, setForcedSessionActive] = useState(false);

  const category = state.videoCategories.find((c) => c.id === categoryId);
  const isAdmin = session?.role === 'admin';

  const videos = useMemo(
    () =>
      state.videos
        .filter((v) => v.categoryId === categoryId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [state.videos, categoryId],
  );

  const canWatch = useCallback(
    (video: Video) =>
      canAccessTier(
        effectiveVideoTier(video.requiredTier, category?.requiredTier),
        session?.patreonTier,
        session?.patreonStatus,
        isAdmin,
      ),
    [category?.requiredTier, session?.patreonTier, session?.patreonStatus, isAdmin],
  );

  const playing =
    videos.find((v) => v.id === playingId) ?? videos.find((v) => canWatch(v)) ?? null;

  const playingLocked = playing != null && !canWatch(playing);

  if (!category) {
    return (
      <div className="page">
        <header className="page-header">
          <h2>Category not found</h2>
          <p className="muted">
            <Link to="/videos">Back to Videos</Link>
          </p>
        </header>
      </div>
    );
  }

  const categoryLocked = !canAccessTier(
    category.requiredTier ?? 'public',
    session?.patreonTier,
    session?.patreonStatus,
    isAdmin,
  );

  return (
    <div className="page">
      <header className="page-header">
        <p className="muted">
          <Link to="/videos">← Videos</Link>
        </p>
        <h2>
          {category.icon ?? '🎬'} {category.name}
        </h2>
        {category.description && (
          <p className="muted">{category.description}</p>
        )}
        <p className="video-category-tier">
          Category access:{' '}
          <TierBadge
            tier={category.requiredTier ?? 'public'}
            accessStyle
          />
        </p>
      </header>

      {categoryLocked && (
        <section className="card">
          <TierUpgradeBanner requiredTier={category.requiredTier ?? 'sweetie'} />
        </section>
      )}

      {videos.length === 0 ? (
        <section className="card">
          <p className="muted">No videos in this category yet.</p>
        </section>
      ) : (
        <>
          {playing && (
            <section className="card video-watch-card">
              <div className="video-watch-card__header">
                <h3 className="section-title">{playing.title}</h3>
                <TierBadge
                  tier={effectiveVideoTier(
                    playing.requiredTier,
                    category.requiredTier,
                  )}
                  accessStyle
                />
              </div>
              {playingLocked ? (
                <TierUpgradeBanner
                  requiredTier={effectiveVideoTier(
                    playing.requiredTier,
                    category.requiredTier,
                  )}
                />
              ) : playing.forcedMode ? (
                <>
                  <ForcedModeVideoPlayer
                    key={playing.id}
                    video={playing}
                    onSessionEnd={() => setForcedSessionActive(false)}
                  />
                  {playing.description && (
                    <p className="muted video-watch-card__desc">{playing.description}</p>
                  )}
                </>
              ) : (
                <>
                  <VideoPlayer video={playing} />
                  {playing.description && (
                    <p className="muted video-watch-card__desc">{playing.description}</p>
                  )}
                </>
              )}
            </section>
          )}

          <section>
            <h3 className="section-title">All videos</h3>
            <div className="video-list">
              {videos.map((v) => {
                const locked = !canWatch(v);
                return (
                  <VideoListItem
                    key={v.id}
                    video={v}
                    category={category}
                    selected={playing?.id === v.id}
                    locked={locked}
                    onSelect={() => {
                      if (forcedSessionActive) return;
                      setPlayingId(v.id);
                      if (v.forcedMode) setForcedSessionActive(true);
                    }}
                  />
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
