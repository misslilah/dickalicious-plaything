import { useAudioPlayer } from '../contexts/AudioPlayerProvider';

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlaylistPreviewModal() {
  const {
    showPreview,
    setShowPreview,
    currentPlaylist,
    playlist,
    currentTrack,
    currentIndex,
    isPlaying,
    trackStatus,
    playTrack,
    isTrackPlayable,
  } = useAudioPlayer();

  if (!showPreview) return null;

  const upcoming = playlist.filter((_, i) => i > currentIndex);

  return (
    <div
      className="audio-preview-modal"
      role="dialog"
      aria-labelledby="audio-preview-title"
      aria-modal="true"
    >
      <div
        className="audio-preview-modal__backdrop"
        aria-hidden="true"
        onClick={() => setShowPreview(false)}
      />
      <div className="audio-preview-modal__panel">
        <header className="audio-playlist-preview__header">
          <h2 id="audio-preview-title" className="audio-preview-modal__title">
            {currentPlaylist ? currentPlaylist.title : 'Audio playlist'}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setShowPreview(false)}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {currentTrack ? (
          <section className="audio-playlist-preview__now">
            <h3 className="section-title">Now playing</h3>
            <div className="audio-playlist-preview__track audio-playlist-preview__track--current">
              <span className="audio-playlist-preview__icon" aria-hidden>
                {isPlaying ? '🎵' : '⏸'}
              </span>
              <div>
                <strong>{currentTrack.title}</strong>
                {currentTrack.durationSeconds != null && (
                  <span className="muted">
                    {' '}
                    · {formatDuration(currentTrack.durationSeconds)}
                  </span>
                )}
              </div>
            </div>
          </section>
        ) : (
          <p className="muted">No track playing.</p>
        )}

        <section className="audio-playlist-preview__upcoming">
          <h3 className="section-title">Upcoming tracks</h3>
          {playlist.length === 0 ? (
            <p className="muted">No tracks in this playlist yet.</p>
          ) : (
            <ul className="audio-playlist-preview__list">
              {playlist.map((track, index) => {
                const status = trackStatus(track.id);
                const locked = status === 'locked';
                const isCurrent = status === 'current';
                const completed = status === 'completed';
                const playable = isTrackPlayable(track.id);

                return (
                  <li
                    key={track.id}
                    className={`audio-playlist-preview__track${
                      isCurrent ? ' audio-playlist-preview__track--current' : ''
                    }${locked ? ' audio-playlist-preview__track--locked' : ''}`}
                  >
                    <span className="audio-playlist-preview__index" aria-hidden>
                      {index + 1}
                    </span>
                    <span className="audio-playlist-preview__icon" aria-hidden>
                      {locked ? '🔒' : completed ? '✓' : isCurrent ? '🎵' : '▶'}
                    </span>
                    <div className="audio-playlist-preview__meta">
                      <span>{track.title}</span>
                      {track.durationSeconds != null && (
                        <span className="muted">
                          {formatDuration(track.durationSeconds)}
                        </span>
                      )}
                    </div>
                    {playable && !isCurrent && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => playTrack(track.id)}
                      >
                        Play
                      </button>
                    )}
                    {locked && (
                      <span className="tag tag--muted">Locked</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {upcoming.length > 0 && currentTrack && (
          <p className="muted audio-playlist-preview__hint">
            {upcoming.filter((t) => trackStatus(t.id) === 'locked').length}{' '}
            upcoming track
            {upcoming.length === 1 ? '' : 's'} still locked until you finish
            the previous ones.
          </p>
        )}
      </div>
    </div>
  );
}
