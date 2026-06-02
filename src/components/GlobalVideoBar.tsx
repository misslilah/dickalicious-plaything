import { Link } from 'react-router-dom';
import { useOptionalVideoPlayer } from '../contexts/VideoPlayerProvider';

export function GlobalVideoBar() {
  const video = useOptionalVideoPlayer();

  if (!video?.showGlobalBar || !video.session) return null;

  const { session, isPlaying, togglePlay } = video;

  return (
    <div className="video-player-bar" role="region" aria-label="Video player">
      <div className="video-player-bar__info">
        <Link
          to={`/videos/category/${session.categoryId}`}
          className="video-player-bar__title"
        >
          {session.title}
        </Link>
        <span className="video-player-bar__hint muted">Tap to return to video</span>
      </div>
      <div className="video-player-bar__controls">
        <button
          type="button"
          className="video-player-bar__btn video-player-bar__btn--primary"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  );
}
