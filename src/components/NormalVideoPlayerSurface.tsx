import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '../contexts/VideoPlayerProvider';
import { VideoLoopToast } from './VideoLoopToast';

export function NormalVideoPlayerSurface() {
  const hostRef = useRef<HTMLDivElement>(null);
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
  } = useVideoPlayer();

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    registerInlineHost(el);
    return () => registerInlineHost(null);
  }, [registerInlineHost, session?.videoId]);

  if (!session) return null;

  if (loading) {
    return <p className="muted">Loading video…</p>;
  }
  if (error || !url) {
    return <p className="login-error">{error ?? 'Video unavailable.'}</p>;
  }

  return (
    <>
      <div className="video-player-wrap" ref={hostRef} />
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
      <VideoLoopToast
        visible={showLoopNotice}
        onDismiss={dismissLoopNotice}
        onTurnOffLoop={turnOffLoop}
      />
    </>
  );
}
