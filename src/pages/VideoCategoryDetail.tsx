import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import { useOptionalVideoPlayer } from '../contexts/VideoPlayerProvider';
import { getPatreonPageUrl } from '../lib/patreon';
import { TierBadge } from '../components/TierBadge';
import { NormalVideoPlayerSurface } from '../components/NormalVideoPlayerSurface';
import {
  canAccessTier,
  effectiveVideoTier,
  requiresTierMessage,
} from '../lib/tiers';
import { ForcedModeVideoPlayer } from '../components/ForcedModeVideoPlayer';
import type { ContentTier, Video, VideoCategory } from '../types';

type PlaybackMode = 'normal' | 'forced';

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

function VideoPlayModePicker({
  onNormal,
  onForced,
}: {
  onNormal: () => void;
  onForced: () => void;
}) {
  return (
    <div className="video-play-mode">
      <p className="muted">How do you want to watch?</p>
      <div className="video-play-mode__actions">
        <button type="button" className="btn btn--primary" onClick={onNormal}>
          Normal play
        </button>
        <button type="button" className="btn btn--ghost" onClick={onForced}>
          Forced Mode
        </button>
      </div>
      <p className="muted video-play-mode__hint">
        Forced Mode locks the view until the video ends. Loop is not available.
      </p>
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
  const globalVideo = useOptionalVideoPlayer();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode | null>(null);
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

  useEffect(() => {
    const gv = globalVideo?.session;
    if (!categoryId || !gv || gv.categoryId !== categoryId) return;
    setPlayingId(gv.videoId);
    setPlaybackMode('normal');
  }, [categoryId, globalVideo?.session?.videoId, globalVideo?.session?.categoryId]);

  useEffect(() => {
    const gv = globalVideo?.session;
    if (
      gv &&
      gv.categoryId === categoryId &&
      gv.videoId === playingId
    ) {
      return;
    }
    setPlaybackMode(null);
  }, [playingId, categoryId, globalVideo?.session?.videoId, globalVideo?.session?.categoryId]);

  const endForcedSession = useCallback(() => {
    setForcedSessionActive(false);
    setPlaybackMode(null);
  }, []);

  const startNormal = useCallback(() => {
    if (!playing || !categoryId) return;
    globalVideo?.startNormalPlayback(playing, categoryId);
    setPlaybackMode('normal');
  }, [playing, categoryId, globalVideo]);

  const startForced = useCallback(() => {
    globalVideo?.clearNormalPlayback();
    setPlaybackMode('forced');
    setForcedSessionActive(true);
  }, [globalVideo]);

  const selectVideo = useCallback(
    (videoId: string) => {
      if (forcedSessionActive) return;
      if (globalVideo?.session && globalVideo.session.videoId !== videoId) {
        globalVideo.clearNormalPlayback();
      }
      setPlayingId(videoId);
    },
    [forcedSessionActive, globalVideo],
  );

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

  const globalMatchesPlaying =
    globalVideo?.session?.videoId === playing?.id &&
    globalVideo.session.categoryId === categoryId;

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
              ) : playbackMode === null ? (
                <VideoPlayModePicker
                  onNormal={startNormal}
                  onForced={startForced}
                />
              ) : playbackMode === 'forced' ? (
                <>
                  <ForcedModeVideoPlayer
                    key={playing.id}
                    video={playing}
                    onSessionEnd={endForcedSession}
                  />
                  {playing.description && (
                    <p className="muted video-watch-card__desc">{playing.description}</p>
                  )}
                </>
              ) : globalMatchesPlaying ? (
                <>
                  <NormalVideoPlayerSurface />
                  {playing.description && (
                    <p className="muted video-watch-card__desc">{playing.description}</p>
                  )}
                </>
              ) : (
                <p className="muted">Starting playback…</p>
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
                    onSelect={() => selectVideo(v.id)}
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
