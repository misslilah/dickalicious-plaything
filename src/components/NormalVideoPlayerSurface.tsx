import { useCallback } from 'react';
import { useVideoPlayer } from '../contexts/VideoPlayerProvider';
import { VideoLoopToast } from './VideoLoopToast';

export function NormalVideoPlayerSurface() {
  const {
    session,
    url,
    loading,
    error,
    loop,
    showLoopNotice,
    toggleLoop,
    dismissLoopNotice,
    turnOffLoop,
    registerInlineHost,
    playlistPlayback,
  } = useVideoPlayer();

  const inPlaylist = playlistPlayback != null;

  const attachHost = useCallback(
    (el: HTMLDivElement | null) => {
      registerInlineHost(el);
    },
    [registerInlineHost],
  );

  if (!session) return null;

  const ready = !loading && !error && url;

  return (
    <>
      <div className="video-player-wrap" ref={attachHost} />
      {loading ? (
        <p className="muted">Loading video…</p>
      ) : error || !url ? (
        <p className="login-error">{error ?? 'Video unavailable.'}</p>
      ) : null}
      {ready ? (
        <>
          {!inPlaylist && (
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
          )}
          <VideoLoopToast
            visible={showLoopNotice}
            onDismiss={dismissLoopNotice}
            onTurnOffLoop={turnOffLoop}
          />
        </>
      ) : null}
    </>
  );
}
