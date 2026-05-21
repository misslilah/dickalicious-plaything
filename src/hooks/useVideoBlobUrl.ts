import { useEffect, useState } from 'react';
import { getVideoPlaybackUrl } from '../lib/videoStorage';

export function useVideoPlaybackUrl(storagePath: string | undefined): {
  url: string | null;
  loading: boolean;
  error: string | null;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!storagePath);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);

    void getVideoPlaybackUrl(storagePath)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setUrl(null);
          return;
        }
        setUrl(result.url);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load video.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  return { url, loading, error };
}

/** @deprecated Use useVideoPlaybackUrl */
export const useVideoBlobUrl = useVideoPlaybackUrl;
