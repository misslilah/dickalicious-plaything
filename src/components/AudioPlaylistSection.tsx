import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAudioPlayer } from '../contexts/AudioPlayerProvider';
import { itemsForPlaylist } from '../lib/audioPlaylist';

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlaylistSection() {
  const {
    playlists,
    allItems,
    playlist,
    currentPlaylist,
    loading,
    error,
    currentTrack,
    isPlaying,
    trackStatus,
    playTrack,
    isTrackPlayable,
    isPlaylistAccessible,
    isPlaylistComplete,
    getPlaylistLockMessage,
    selectPlaylist,
  } = useAudioPlayer();

  const [viewPlaylistId, setViewPlaylistId] = useState<string | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  if (loading) {
    return (
      <section className="card">
        <p className="muted">Loading audio playlists…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="card">
        <p className="login-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (playlists.length === 0) {
    return (
      <section className="card">
        <p className="muted">
          No audio playlists yet. An admin can create playlists from{' '}
          <Link to="/admin">Admin → Audio playlist</Link>.
        </p>
      </section>
    );
  }

  const openPlaylist = (playlistId: string) => {
    if (!isPlaylistAccessible(playlistId)) {
      setLockMessage(getPlaylistLockMessage(playlistId));
      return;
    }
    setLockMessage(null);
    setViewPlaylistId(playlistId);
    selectPlaylist(playlistId);
  };

  const closePlaylistView = () => {
    setViewPlaylistId(null);
    setLockMessage(null);
  };

  if (viewPlaylistId && currentPlaylist && viewPlaylistId === currentPlaylist.id) {
    const tracks = playlist;

    return (
      <section>
        <div className="audio-playlist__toolbar">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={closePlaylistView}
          >
            ← All playlists
          </button>
        </div>
        <header className="audio-playlist__detail-header">
          <h3 className="section-title">{currentPlaylist.title}</h3>
          {currentPlaylist.description && (
            <p className="muted">{currentPlaylist.description}</p>
          )}
        </header>
        <p className="muted audio-playlist__intro">
          Listen in order — each track unlocks after you finish the previous one.
          Forward seeking is disabled.
        </p>
        {tracks.length === 0 ? (
          <section className="card">
            <p className="muted">This playlist has no tracks yet.</p>
          </section>
        ) : (
          <ul className="audio-playlist__list">
            {tracks.map((track, index) => {
              const status = trackStatus(track.id);
              const locked = status === 'locked';
              const isCurrent = status === 'current';
              const completed = status === 'completed';
              const playable = isTrackPlayable(track.id);

              return (
                <li
                  key={track.id}
                  className={`audio-playlist__item card${
                    isCurrent ? ' audio-playlist__item--current' : ''
                  }${locked ? ' audio-playlist__item--locked' : ''}`}
                >
                  <div className="audio-playlist__item-main">
                    <span className="audio-playlist__index" aria-hidden>
                      {index + 1}
                    </span>
                    <span className="audio-playlist__status" aria-hidden>
                      {locked ? '🔒' : completed ? '✓' : isCurrent && isPlaying ? '🎵' : '▶'}
                    </span>
                    <div className="audio-playlist__meta">
                      <strong>{track.title}</strong>
                      {track.durationSeconds != null && (
                        <span className="muted">
                          {formatDuration(track.durationSeconds)}
                        </span>
                      )}
                      {locked && (
                        <span className="audio-playlist__lock-hint muted">
                          Finish track {index} to unlock
                        </span>
                      )}
                      {isCurrent && (
                        <span className="tag tag--ok">Playing</span>
                      )}
                      {completed && !isCurrent && (
                        <span className="tag">Completed</span>
                      )}
                    </div>
                  </div>
                  {playable ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => playTrack(track.id)}
                      disabled={isCurrent && isPlaying}
                    >
                      {isCurrent ? (isPlaying ? 'Playing…' : 'Resume') : 'Play'}
                    </button>
                  ) : (
                    <span className="tag tag--muted">Locked</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {currentTrack && currentTrack.playlistId === viewPlaylistId && (
          <p className="muted audio-playlist__now muted">
            Now: {currentTrack.title}
            {isPlaying ? ' (playing)' : ' (paused)'}
          </p>
        )}
      </section>
    );
  }

  return (
    <section>
      <p className="muted audio-playlist__intro">
        Choose a playlist. Some require a Patreon tier or unlock only after you
        complete another playlist.
      </p>
      <ul className="audio-playlist__catalog">
        {playlists.map((pl) => {
          const tracks = itemsForPlaylist(pl.id, allItems);
          const accessible = isPlaylistAccessible(pl.id);
          const complete = isPlaylistComplete(pl.id);
          const lockMsg = getPlaylistLockMessage(pl.id);

          return (
            <li key={pl.id}>
              <button
                type="button"
                className={`audio-playlist__catalog-card card${
                  accessible ? '' : ' audio-playlist__catalog-card--locked'
                }${complete ? ' audio-playlist__catalog-card--complete' : ''}`}
                onClick={() => openPlaylist(pl.id)}
                aria-disabled={!accessible}
              >
                <div className="audio-playlist__catalog-main">
                  <span className="audio-playlist__catalog-icon" aria-hidden>
                    {!accessible ? '🔒' : complete ? '✓' : '🎧'}
                  </span>
                  <div className="audio-playlist__catalog-meta">
                    <strong>{pl.title}</strong>
                    {pl.description && (
                      <span className="muted">{pl.description}</span>
                    )}
                    <span className="muted">
                      {tracks.length} track{tracks.length === 1 ? '' : 's'}
                      {!accessible && lockMsg ? ` · Locked` : ''}
                      {complete ? ' · Completed' : ''}
                    </span>
                  </div>
                </div>
                <span className="audio-playlist__catalog-action">
                  {accessible ? 'Open →' : 'Locked'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {lockMessage && (
        <div
          className="audio-playlist__lock-overlay"
          role="alertdialog"
          aria-labelledby="audio-playlist-lock-title"
          aria-describedby="audio-playlist-lock-desc"
        >
          <div
            className="audio-playlist__lock-backdrop"
            aria-hidden="true"
            onClick={() => setLockMessage(null)}
          />
          <div className="audio-playlist__lock-panel card">
            <h3 id="audio-playlist-lock-title" className="section-title">
              Playlist locked
            </h3>
            <p id="audio-playlist-lock-desc">{lockMessage}</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setLockMessage(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
