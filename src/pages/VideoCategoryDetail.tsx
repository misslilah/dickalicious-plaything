import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import { useVideoPlaybackUrl } from '../hooks/useVideoBlobUrl';
import type { Video } from '../types';

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
  selected,
  onSelect,
}: {
  video: Video;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={
        selected ? 'video-list-item video-list-item--active' : 'video-list-item'
      }
      onClick={onSelect}
    >
      <span className="video-list-item__icon" aria-hidden>
        🎬
      </span>
      <span className="video-list-item__body">
        <strong>{video.title}</strong>
        {video.description && (
          <span className="muted video-list-item__desc">{video.description}</span>
        )}
      </span>
    </button>
  );
}

export function VideoCategoryDetail() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { state } = useAppStore();
  const [playingId, setPlayingId] = useState<string | null>(null);

  const category = state.videoCategories.find((c) => c.id === categoryId);
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

  const playing = videos.find((v) => v.id === playingId) ?? videos[0] ?? null;

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
      </header>

      {videos.length === 0 ? (
        <section className="card">
          <p className="muted">No videos in this category yet.</p>
        </section>
      ) : (
        <>
          {playing && (
            <section className="card video-watch-card">
              <h3 className="section-title">{playing.title}</h3>
              <VideoPlayer video={playing} />
              {playing.description && (
                <p className="muted video-watch-card__desc">{playing.description}</p>
              )}
            </section>
          )}

          <section>
            <h3 className="section-title">All videos</h3>
            <div className="video-list">
              {videos.map((v) => (
                <VideoListItem
                  key={v.id}
                  video={v}
                  selected={playing?.id === v.id}
                  onSelect={() => setPlayingId(v.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
