interface VideoPlaylistProgressBannerProps {
  title: string;
  current: number;
  total: number;
  onExit: () => void;
}

export function VideoPlaylistProgressBanner({
  title,
  current,
  total,
  onExit,
}: VideoPlaylistProgressBannerProps) {
  return (
    <div className="video-playlist-banner card" role="status" aria-live="polite">
      <div className="video-playlist-banner__main">
        <span className="video-playlist-banner__label">Playlist</span>
        <strong className="video-playlist-banner__title">{title}</strong>
        <span className="muted video-playlist-banner__progress">
          {current} / {total}
        </span>
      </div>
      <button type="button" className="btn btn--ghost btn--small" onClick={onExit}>
        Exit playlist
      </button>
    </div>
  );
}
