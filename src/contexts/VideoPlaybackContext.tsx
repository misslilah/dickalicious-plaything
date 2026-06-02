import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface VideoPlaybackContextValue {
  /** True when any registered video surface is actively playing. */
  isPlaybackActive: boolean;
  setPlaybackActive: (active: boolean) => void;
}

const VideoPlaybackContext = createContext<VideoPlaybackContextValue | null>(null);

export function VideoPlaybackProvider({ children }: { children: ReactNode }) {
  const activeCountRef = useRef(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);

  const setPlaybackActive = useCallback((active: boolean) => {
    const next = active
      ? activeCountRef.current + 1
      : Math.max(0, activeCountRef.current - 1);
    activeCountRef.current = next;
    setIsPlaybackActive(next > 0);
  }, []);

  const value = useMemo(
    () => ({ isPlaybackActive, setPlaybackActive }),
    [isPlaybackActive, setPlaybackActive],
  );

  return (
    <VideoPlaybackContext.Provider value={value}>
      {children}
    </VideoPlaybackContext.Provider>
  );
}

export function useVideoPlayback() {
  const ctx = useContext(VideoPlaybackContext);
  if (!ctx) {
    throw new Error('useVideoPlayback must be used within VideoPlaybackProvider');
  }
  return ctx;
}

/** Register active video playback for the lifetime of `active === true`. */
export function useVideoPlaybackActive(active: boolean) {
  const { setPlaybackActive } = useVideoPlayback();

  useEffect(() => {
    if (!active) return;
    setPlaybackActive(true);
    return () => setPlaybackActive(false);
  }, [active, setPlaybackActive]);
}

export function isVideoSectionPath(pathname: string): boolean {
  return pathname === '/videos' || pathname.startsWith('/videos/');
}
