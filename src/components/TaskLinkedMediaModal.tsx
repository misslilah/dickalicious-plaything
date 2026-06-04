import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { fetchAudioLibrary } from '../lib/audioPlaylist';
import { hasVideoAccess } from '../lib/videoAccess';
import { effectiveVideoTier, requiresTierMessage } from '../lib/tiers';
import { getVideoPlaybackUrl } from '../lib/videoStorage';
import { getTaskLinkedMediaType } from '../lib/taskLinkedMedia';
import { useNoSeekMedia } from '../lib/useNoSeekMedia';
import { useAppStore } from '../hooks/useAppStore';
import type { Task } from '../types';

export type TaskLinkedMediaCloseReason = 'completed' | 'failed' | 'dismissed';

interface TaskLinkedMediaModalProps {
  task: Task;
  open: boolean;
  onClose: (reason: TaskLinkedMediaCloseReason) => void;
}

export function TaskLinkedMediaModal({
  task,
  open,
  onClose,
}: TaskLinkedMediaModalProps) {
  const { state, session } = useAppStore();
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const playbackStartedRef = useRef(false);
  const completedRef = useRef(false);

  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mediaType = getTaskLinkedMediaType(task);
  const isVideo = mediaType === 'video';
  const isAudio = mediaType === 'audio';

  const video = useMemo(
    () =>
      isVideo && task.linkedVideoId
        ? state.videos.find((v) => v.id === task.linkedVideoId)
        : undefined,
    [isVideo, task.linkedVideoId, state.videos],
  );

  const videoCategory = useMemo(
    () =>
      video ? state.videoCategories.find((c) => c.id === video.categoryId) : undefined,
    [video, state.videoCategories],
  );

  const videoAccessCtx = useMemo(
    () => ({
      patreonTier: session?.patreonTier,
      patreonStatus: session?.patreonStatus,
      isAdmin: session?.role === 'admin',
      purchasedVideoIds: state.purchasedVideoIds ?? [],
    }),
    [session, state.purchasedVideoIds],
  );

  const videoLocked =
    isVideo && video != null && !hasVideoAccess(video, videoCategory, videoAccessCtx);

  const lockMessage = useMemo(() => {
    if (!videoLocked || !video) return null;
    const required = effectiveVideoTier(
      video.requiredTier,
      videoCategory?.requiredTier,
    );
    return `${requiresTierMessage(required)} Patreon tier or higher. Connect Patreon in Settings to upgrade.`;
  }, [videoLocked, video, videoCategory]);

  useNoSeekMedia(mediaRef, open && !videoLocked && Boolean(mediaUrl));

  const resetModal = useCallback(() => {
    playbackStartedRef.current = false;
    completedRef.current = false;
    setMediaUrl(null);
    setLoadError(null);
    setLoading(false);
    const el = mediaRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      resetModal();
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setMediaUrl(null);

      if (isVideo) {
        if (!video) {
          if (!cancelled) {
            setLoadError('Linked video not found.');
            setLoading(false);
          }
          return;
        }
        if (videoLocked) {
          if (!cancelled) setLoading(false);
          return;
        }
        const result = await getVideoPlaybackUrl(video.storagePath);
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.error);
          setLoading(false);
          return;
        }
        setMediaUrl(result.url);
        setLoading(false);
        return;
      }

      if (isAudio) {
        const direct = task.linkedAudioUrl?.trim();
        if (direct) {
          if (!cancelled) {
            setMediaUrl(direct);
            setLoading(false);
          }
          return;
        }
        if (!task.linkedAudioItemId) {
          if (!cancelled) {
            setLoadError('No audio configured for this task.');
            setLoading(false);
          }
          return;
        }
        const lib = await fetchAudioLibrary();
        if (cancelled) return;
        if (!lib.ok) {
          setLoadError(lib.error);
          setLoading(false);
          return;
        }
        const item = lib.items.find((i) => i.id === task.linkedAudioItemId);
        if (!item?.url) {
          setLoadError('Linked audio track not found.');
          setLoading(false);
          return;
        }
        setMediaUrl(item.url);
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    isVideo,
    isAudio,
    video,
    videoLocked,
    task.linkedAudioUrl,
    task.linkedAudioItemId,
    resetModal,
  ]);

  useEffect(() => {
    if (!open || !mediaUrl || videoLocked) return;
    const el = mediaRef.current;
    if (!el) return;
    el.load();
  }, [open, mediaUrl, videoLocked]);

  const handleCloseEarly = useCallback(() => {
    if (completedRef.current) return;
    if (videoLocked || loadError || !playbackStartedRef.current) {
      resetModal();
      onClose('dismissed');
      return;
    }
    resetModal();
    onClose('failed');
  }, [videoLocked, loadError, resetModal, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseEarly();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, handleCloseEarly]);

  const handleEnded = () => {
    completedRef.current = true;
    resetModal();
    onClose('completed');
  };

  const handlePlay = () => {
    playbackStartedRef.current = true;
  };

  if (!open) return null;

  const title =
    mediaType === 'video'
      ? video?.title ?? 'Watch video'
      : 'Listen to audio';

  return (
    <div
      className="task-linked-media-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-linked-media-title"
    >
      <button
        type="button"
        className="task-linked-media-modal__backdrop"
        aria-label="Close"
        onClick={handleCloseEarly}
      />
      <div className="task-linked-media-modal__panel">
        <header className="task-linked-media-modal__header">
          <h2 id="task-linked-media-title" className="task-linked-media-modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={handleCloseEarly}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <p className="task-linked-media-modal__warning" role="note">
          Closing before finishing will fail this task.
        </p>

        {loading && <p className="muted">Loading…</p>}

        {loadError && (
          <p className="login-error" role="alert">
            {loadError}
          </p>
        )}

        {videoLocked && (
          <p className="login-error" role="alert">
            {lockMessage}
          </p>
        )}

        {mediaUrl && !videoLocked && !loadError && (
          <>
            {isVideo ? (
              <video
                ref={mediaRef as RefObject<HTMLVideoElement>}
                className="task-linked-media-modal__player"
                src={mediaUrl}
                controls
                controlsList="nodownload noplaybackrate noremoteplayback"
                playsInline
                onPlay={handlePlay}
                onEnded={handleEnded}
              />
            ) : (
              <audio
                ref={mediaRef as RefObject<HTMLAudioElement>}
                className="task-linked-media-modal__player"
                src={mediaUrl}
                controls
                controlsList="nodownload noplaybackrate noremoteplayback"
                onPlay={handlePlay}
                onEnded={handleEnded}
              />
            )}
            <p className="task-linked-media-modal__hint muted">
              Forward seeking is disabled. Watch or listen until the end.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
