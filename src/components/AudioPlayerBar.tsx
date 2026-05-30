import { useAudioPlayer } from '../contexts/AudioPlayerProvider';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayerBar() {
  const {
    currentTrack,
    currentPlaylist,
    isPlaying,
    loopEnabled,
    togglePlay,
    previousTrack,
    toggleLoop,
  } = useAudioPlayer();

  if (!currentTrack) return null;

  const duration = currentTrack.durationSeconds;

  return (
    <div className="audio-player-bar" role="region" aria-label="Audio player">
      <div className="audio-player-bar__info">
        <span className="audio-player-bar__title">{currentTrack.title}</span>
        {currentPlaylist && (
          <span className="audio-player-bar__playlist muted">
            {currentPlaylist.title}
          </span>
        )}
        {duration != null && (
          <span className="audio-player-bar__duration muted">
            {formatTime(duration)}
          </span>
        )}
      </div>
      <div className="audio-player-bar__controls">
        <button
          type="button"
          className="audio-player-bar__btn"
          onClick={previousTrack}
          aria-label="Previous track"
          title="Previous"
        >
          ⏮
        </button>
        <button
          type="button"
          className="audio-player-bar__btn audio-player-bar__btn--primary"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className={`audio-player-bar__btn${loopEnabled ? ' audio-player-bar__btn--active' : ''}`}
          onClick={toggleLoop}
          aria-label={loopEnabled ? 'Loop on' : 'Loop off'}
          aria-pressed={loopEnabled}
          title="Loop current track"
        >
          🔁
        </button>
      </div>
    </div>
  );
}
