import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useOptionalVideoPlayer } from '../contexts/VideoPlayerProvider';
import { useAppStore } from '../hooks/useAppStore';
import { useVideoPlaybackActive } from '../contexts/VideoPlaybackContext';
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  isMouthOpen,
  isTongueHeuristic,
  mouthAspectRatio,
  type NormalizedLandmark,
} from '../lib/facePoseDetection';
import { isAnyHandNearNose } from '../lib/handNearNose';
import {
  CUE_COMMAND_LABELS,
  CUE_KEEP_LABELS,
  getInteractiveVideoPlaybackUrl,
  type InteractiveCueCommand,
  type InteractiveVideo,
  type InteractiveVideoCue,
} from '../lib/interactiveVideos';
import { PrivacyNotice } from './PrivacyNotice';

const MEDIAPIPE_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const TONGUE_HOLD_FRAMES = 6;
const CUE_TOLERANCE_MS = 120;
/** Consecutive missed detections before persistent "keep" pause (reduces prod flapping). */
const PERSISTENT_MISS_FRAMES = 12;
/** Refresh signed URLs before the 1h Supabase TTL expires. */
const SIGNED_URL_REFRESH_MS = 55 * 60 * 1000;

function isPlayNotAllowedError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.code === 20)
  );
}

/** iOS Safari and most mobile browsers block play() outside a user gesture. */
function isMobilePlaybackPolicy(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return true;
  return window.matchMedia?.('(pointer: coarse)')?.matches === true;
}

function resolveVideoSrc(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

type PlayerPhase =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'awaiting_action'
  | 'keep_action'
  | 'done';

interface InteractiveVideoPlayerProps {
  video: InteractiveVideo;
}

function formatTimeMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function isPersistentMonitoringActive(
  cue: InteractiveVideoCue,
  currentMs: number,
): boolean {
  if (!cue.persistent) return false;
  if (cue.endTimeMs == null) return true;
  return currentMs < cue.endTimeMs;
}

function findNextUnfiredCue(
  cues: InteractiveVideoCue[],
  firedIds: Set<string>,
): InteractiveVideoCue | undefined {
  return cues.find((c) => !firedIds.has(c.id));
}

function shouldFireCueAtTime(cue: InteractiveVideoCue, currentMs: number): boolean {
  return currentMs >= cue.timeMs - CUE_TOLERANCE_MS;
}

function isStartCue(cue: InteractiveVideoCue): boolean {
  return cue.timeMs <= CUE_TOLERANCE_MS;
}

function getDocumentFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
  };
  return (
    doc.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    null
  );
}

function detectCommandSuccess(
  command: InteractiveCueCommand,
  faceLandmarks: NormalizedLandmark[] | undefined,
  handLandmarks: NormalizedLandmark[][],
  tongueFrameCount: number,
): boolean {
  if (!faceLandmarks) return false;
  const mar = mouthAspectRatio(faceLandmarks);
  switch (command) {
    case 'sniff':
      return isAnyHandNearNose(faceLandmarks, handLandmarks);
    case 'mouth_open':
      return isMouthOpen(mar);
    case 'tongue_out':
      return isTongueHeuristic(mar) && tongueFrameCount >= TONGUE_HOLD_FRAMES;
    default:
      return false;
  }
}

export function InteractiveVideoPlayer({ video }: InteractiveVideoPlayerProps) {
  const { session } = useAppStore();
  const audio = useOptionalAudioPlayer();
  const globalVideo = useOptionalVideoPlayer();
  const isAdmin = session?.role === 'admin';

  const playbackRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const firedCueIdsRef = useRef<Set<string>>(new Set());
  const tongueFramesRef = useRef(0);
  const monitoringCueRef = useRef<InteractiveVideoCue | null>(null);
  const phaseRef = useRef<PlayerPhase>('loading');

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState<PlayerPhase>('loading');
  phaseRef.current = phase;
  const [activeCue, setActiveCue] = useState<InteractiveVideoCue | null>(null);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [started, setStarted] = useState(false);
  const [firedCount, setFiredCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const wantsFullscreenRef = useRef(false);
  const pseudoFullscreenRef = useRef(false);
  const enteringNativeRef = useRef(false);
  const hadNativeFullscreenRef = useRef(false);
  const syncGenerationRef = useRef(0);
  const playbackPrimedRef = useRef(false);
  const mediaReadyRef = useRef(false);
  const playbackSourceKeyRef = useRef('');
  const allowAutoResumeRef = useRef(false);
  const persistentMissFramesRef = useRef(0);
  const pendingRestoreRef = useRef<{ currentTime: number; play: boolean } | null>(
    null,
  );

  const [mediaReady, setMediaReady] = useState(false);
  const [urlLoading, setUrlLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [urlRetryCount, setUrlRetryCount] = useState(0);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);

  pseudoFullscreenRef.current = pseudoFullscreen;

  const markMediaReady = useCallback(() => {
    if (!mediaReadyRef.current) {
      mediaReadyRef.current = true;
      setMediaReady(true);
      if (phaseRef.current === 'loading') {
        phaseRef.current = 'ready';
        setPhase('ready');
      }
    }
  }, []);

  const retryPlaybackUrl = useCallback(() => {
    setLoadError('');
    setUrlRetryCount((n) => n + 1);
  }, []);

  useVideoPlaybackActive(
    started &&
      (phase === 'playing' ||
        phase === 'awaiting_action' ||
        phase === 'keep_action'),
  );

  const applyPseudoFullscreen = useCallback((active: boolean) => {
    pseudoFullscreenRef.current = active;
    setPseudoFullscreen(active);
  }, []);

  const clearFullscreenState = useCallback(() => {
    wantsFullscreenRef.current = false;
    enteringNativeRef.current = false;
    hadNativeFullscreenRef.current = false;
    applyPseudoFullscreen(false);
    setIsFullscreen(false);
  }, [applyPseudoFullscreen]);

  const enablePseudoFullscreen = useCallback(async () => {
    if (getDocumentFullscreenElement()) {
      try {
        await document.exitFullscreen();
      } catch {
        // Native fullscreen must end before pseudo-fullscreen CSS applies.
      }
    }
    wantsFullscreenRef.current = true;
    enteringNativeRef.current = false;
    applyPseudoFullscreen(true);
    setIsFullscreen(true);
  }, [applyPseudoFullscreen]);

  useEffect(() => {
    document.body.classList.toggle(
      'interactive-video-player--pseudo-fs',
      pseudoFullscreen,
    );
    return () => {
      document.body.classList.remove('interactive-video-player--pseudo-fs');
    };
  }, [pseudoFullscreen]);

  const syncFullscreenFromDocument = useCallback(() => {
    const stage = stageRef.current;
    const fsElement = getDocumentFullscreenElement();
    const native = stage != null && fsElement === stage;

    if (native) {
      enteringNativeRef.current = false;
      hadNativeFullscreenRef.current = true;
      if (pseudoFullscreenRef.current) {
        applyPseudoFullscreen(false);
      }
      wantsFullscreenRef.current = true;
      setIsFullscreen(true);
      return;
    }

    if (wantsFullscreenRef.current && pseudoFullscreenRef.current) {
      setIsFullscreen(true);
      return;
    }

    if (!wantsFullscreenRef.current) {
      clearFullscreenState();
      return;
    }

    // User wants fullscreen but the document is not on our stage yet.
    if (enteringNativeRef.current) {
      const generation = ++syncGenerationRef.current;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (generation !== syncGenerationRef.current) return;
          const stageAfter = stageRef.current;
          const nativeAfter =
            stageAfter != null &&
            getDocumentFullscreenElement() === stageAfter;
          if (nativeAfter) {
            syncFullscreenFromDocument();
            return;
          }
          if (!wantsFullscreenRef.current) return;
          enteringNativeRef.current = false;
          void enablePseudoFullscreen();
        });
      });
      return;
    }

    if (hadNativeFullscreenRef.current) {
      const generation = ++syncGenerationRef.current;
      requestAnimationFrame(() => {
        if (generation !== syncGenerationRef.current) return;
        const stageAfter = stageRef.current;
        const stillNative =
          stageAfter != null &&
          getDocumentFullscreenElement() === stageAfter;
        if (stillNative) {
          syncFullscreenFromDocument();
          return;
        }
        hadNativeFullscreenRef.current = false;
        clearFullscreenState();
      });
      return;
    }
  }, [
    applyPseudoFullscreen,
    clearFullscreenState,
    enablePseudoFullscreen,
  ]);

  useEffect(() => {
    const onFullscreenChange = () => {
      syncFullscreenFromDocument();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, [syncFullscreenFromDocument]);

  const toggleFullscreen = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;

    const fsElement = getDocumentFullscreenElement();
    const nativeActive = fsElement === stage;
    if (nativeActive || pseudoFullscreenRef.current) {
      syncGenerationRef.current += 1;
      if (nativeActive) {
        try {
          await document.exitFullscreen();
        } catch {
          // Fullscreen may already be exiting.
        }
      }
      clearFullscreenState();
      return;
    }

    wantsFullscreenRef.current = true;
    enteringNativeRef.current = true;
    setIsFullscreen(true);

    const stageAny = stage as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const requestFs =
      typeof stage.requestFullscreen === 'function'
        ? () => stage.requestFullscreen()
        : typeof stageAny.webkitRequestFullscreen === 'function'
          ? () => stageAny.webkitRequestFullscreen!()
          : null;

    if (requestFs && document.fullscreenEnabled !== false) {
      try {
        await requestFs();
        if (getDocumentFullscreenElement() === stage) {
          enteringNativeRef.current = false;
          hadNativeFullscreenRef.current = true;
          applyPseudoFullscreen(false);
          setIsFullscreen(true);
          return;
        }
      } catch {
        // Fall through to pseudo-fullscreen when the API is unavailable or denied.
      }
    }

    enteringNativeRef.current = false;
    await enablePseudoFullscreen();
  }, [applyPseudoFullscreen, clearFullscreenState, enablePseudoFullscreen]);

  const handleFullscreenClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void toggleFullscreen();
    },
    [toggleFullscreen],
  );

  const sortedCues = video.cues;

  const suspendGlobalMedia = useCallback(() => {
    audio?.pausePlayback();
    globalVideo?.clearNormalPlayback();
  }, [audio, globalVideo]);

  const resetSession = useCallback(() => {
    allowAutoResumeRef.current = false;
    setNeedsTapToPlay(false);
    persistentMissFramesRef.current = 0;
    firedCueIdsRef.current = new Set();
    monitoringCueRef.current = null;
    tongueFramesRef.current = 0;
    setActiveCue(null);
    setOverlayMessage('');
    setBuffering(false);
    const el = playbackRef.current;
    if (el) {
      el.currentTime = 0;
      el.pause();
    }
    phaseRef.current = 'ready';
    setPhase('ready');
    setStarted(false);
    setFiredCount(0);
  }, []);

  useEffect(() => {
    resetSession();
    playbackPrimedRef.current = false;
    mediaReadyRef.current = false;
    setMediaReady(false);
    setLoadError('');
    phaseRef.current = 'loading';
    setPhase('loading');
  }, [video.id, resetSession]);

  useEffect(() => {
    let cancelled = false;
    const sourceKey = `${video.id}:${video.storagePath}`;
    playbackSourceKeyRef.current = sourceKey;
    playbackPrimedRef.current = false;
    mediaReadyRef.current = false;
    setMediaReady(false);
    setPlaybackUrl(null);
    setUrlLoading(true);
    setLoadError('');

    void getInteractiveVideoPlaybackUrl(video.storagePath).then((result) => {
      if (cancelled || playbackSourceKeyRef.current !== sourceKey) return;
      setUrlLoading(false);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setPlaybackUrl(result.url);
    });
    return () => {
      cancelled = true;
    };
  }, [video.id, video.storagePath, urlRetryCount]);

  useEffect(() => {
    const el = playbackRef.current;
    if (!el || !playbackUrl) return;
    const sourceKey = playbackSourceKeyRef.current;
    const resolved = resolveVideoSrc(playbackUrl);
    if (el.src !== resolved) {
      playbackPrimedRef.current = false;
      mediaReadyRef.current = false;
      setMediaReady(false);
      el.src = playbackUrl;
      el.load();
    }
    return () => {
      if (playbackSourceKeyRef.current !== sourceKey) return;
      allowAutoResumeRef.current = false;
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [playbackUrl]);

  useEffect(() => {
    if (!started || !video.storagePath) return;

    const refreshUrl = () => {
      const sourceKey = playbackSourceKeyRef.current;
      void getInteractiveVideoPlaybackUrl(video.storagePath).then((result) => {
        if (!result.ok || playbackSourceKeyRef.current !== sourceKey) return;
        const el = playbackRef.current;
        if (!el) return;
        const nextSrc = resolveVideoSrc(result.url);
        if (el.src === nextSrc) return;

        const restore = {
          currentTime: el.currentTime,
          play:
            allowAutoResumeRef.current &&
            phaseRef.current === 'playing' &&
            !el.paused,
        };
        pendingRestoreRef.current = restore;
        allowAutoResumeRef.current = false;
        setPlaybackUrl(result.url);
      });
    };

    const intervalId = window.setInterval(refreshUrl, SIGNED_URL_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [started, video.storagePath]);

  useEffect(() => {
    let cancelled = false;
    const createLandmarkers = async (
      vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
      delegate: 'GPU' | 'CPU',
    ) =>
      Promise.all([
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
        }),
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
        }),
      ]);

    void (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        if (cancelled) return;
        let faceLandmarker: FaceLandmarker;
        let handLandmarker: HandLandmarker;
        try {
          [faceLandmarker, handLandmarker] = await createLandmarkers(vision, 'GPU');
        } catch {
          [faceLandmarker, handLandmarker] = await createLandmarkers(vision, 'CPU');
        }
        if (cancelled) {
          faceLandmarker.close();
          handLandmarker.close();
          return;
        }
        faceLandmarkerRef.current = faceLandmarker;
        handLandmarkerRef.current = handLandmarker;
        setModelsReady(true);
      } catch {
        if (!cancelled) {
          setCameraError('Could not load detection models. Check your connection and retry.');
        }
      }
    })();
    return () => {
      cancelled = true;
      faceLandmarkerRef.current?.close();
      handLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
      handLandmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const cam = cameraRef.current;
        if (cam) {
          cam.srcObject = stream;
          await cam.play();
        }
        setCameraReady(true);
      } catch {
        if (!cancelled) {
          setCameraError('Camera access is required for interactive videos.');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const triggerCue = useCallback((cue: InteractiveVideoCue) => {
    const el = playbackRef.current;
    if (!el || firedCueIdsRef.current.has(cue.id)) return;
    setNeedsTapToPlay(false);
    allowAutoResumeRef.current = false;
    persistentMissFramesRef.current = 0;
    el.pause();
    firedCueIdsRef.current.add(cue.id);
    setFiredCount(firedCueIdsRef.current.size);
    monitoringCueRef.current = null;
    tongueFramesRef.current = 0;
    setActiveCue(cue);
    setOverlayMessage(CUE_COMMAND_LABELS[cue.commandType]);
    phaseRef.current = 'awaiting_action';
    setPhase('awaiting_action');
  }, []);

  const checkForCueAtTime = useCallback(
    (currentMs: number) => {
      if (phaseRef.current !== 'playing') return;
      const nextCue = findNextUnfiredCue(sortedCues, firedCueIdsRef.current);
      if (nextCue && shouldFireCueAtTime(nextCue, currentMs)) {
        triggerCue(nextCue);
      }
    },
    [sortedCues, triggerCue],
  );

  const releasePersistentMonitor = useCallback(() => {
    monitoringCueRef.current = null;
    setActiveCue(null);
    setOverlayMessage('');
  }, []);

  const resumeAfterCue = useCallback((cue: InteractiveVideoCue) => {
    const el = playbackRef.current;
    if (!el) return;
    const currentPhase = phaseRef.current;
    if (currentPhase !== 'awaiting_action' && currentPhase !== 'keep_action') return;

    setActiveCue(null);
    setOverlayMessage('');
    phaseRef.current = 'playing';
    setPhase('playing');
    monitoringCueRef.current = cue.persistent ? cue : null;
    persistentMissFramesRef.current = 0;
    allowAutoResumeRef.current = true;
    setBuffering(false);

    if (isMobilePlaybackPolicy()) {
      setNeedsTapToPlay(true);
      allowAutoResumeRef.current = false;
      return;
    }

    void el.play().catch((err) => {
      if (isPlayNotAllowedError(err)) {
        setNeedsTapToPlay(true);
        allowAutoResumeRef.current = false;
        return;
      }
      setLoadError('Could not resume playback.');
    });
  }, []);

  const handleTapToContinue = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = playbackRef.current;
    if (!el) return;
    allowAutoResumeRef.current = true;
    setBuffering(false);
    void el.play().then(() => {
      setNeedsTapToPlay(false);
    }).catch((err) => {
      if (!isPlayNotAllowedError(err)) {
        setLoadError('Could not resume playback.');
      }
    });
  }, []);

  const startPlayback = useCallback(() => {
    const el = playbackRef.current;
    if (!el || !playbackUrl) return;
    suspendGlobalMedia();
    firedCueIdsRef.current = new Set();
    monitoringCueRef.current = null;
    tongueFramesRef.current = 0;
    persistentMissFramesRef.current = 0;
    setActiveCue(null);
    setOverlayMessage('');
    setFiredCount(0);
    setBuffering(false);
    el.currentTime = 0;
    el.pause();
    setStarted(true);

    const firstCue = findNextUnfiredCue(sortedCues, firedCueIdsRef.current);
    if (firstCue && isStartCue(firstCue)) {
      triggerCue(firstCue);
      return;
    }

    phaseRef.current = 'playing';
    setPhase('playing');
    allowAutoResumeRef.current = true;
    void el.play().catch((err) => {
      if (isPlayNotAllowedError(err)) {
        setNeedsTapToPlay(true);
        allowAutoResumeRef.current = false;
        return;
      }
      setLoadError('Could not start playback.');
    });
  }, [playbackUrl, sortedCues, triggerCue, suspendGlobalMedia]);

  const handleStartClick = useCallback(() => {
    const el = playbackRef.current;
    if (el) {
      void el.play().catch(() => undefined);
    }
    startPlayback();
  }, [startPlayback]);

  useEffect(() => {
    if (!started || !cameraReady || !modelsReady) return;
    if (phase !== 'playing' && phase !== 'awaiting_action' && phase !== 'keep_action') return;

    const cam = cameraRef.current;
    const faceLandmarker = faceLandmarkerRef.current;
    const handLandmarker = handLandmarkerRef.current;
    if (!cam || !faceLandmarker || !handLandmarker) return;

    const tick = () => {
      const playback = playbackRef.current;
      if (!playback) return;

      const currentPhase = phaseRef.current;
      const currentMs = playback.currentTime * 1000;

      if (
        (currentPhase === 'awaiting_action' || currentPhase === 'keep_action') &&
        !playback.paused
      ) {
        playback.pause();
      }

      if (
        currentPhase === 'playing' &&
        playback.paused &&
        allowAutoResumeRef.current &&
        !document.hidden &&
        !isMobilePlaybackPolicy()
      ) {
        void playback.play().catch(() => undefined);
      }

      if (currentPhase === 'playing' && !playback.paused) {
        checkForCueAtTime(currentMs);
      }

      if (cam.readyState >= 2) {
        const now = performance.now();
        const faceResult = faceLandmarker.detectForVideo(cam, now);
        const handResult = handLandmarker.detectForVideo(cam, now);
        const faceLandmarks = faceResult.faceLandmarks[0] as
          | NormalizedLandmark[]
          | undefined;
        const handLandmarks = (handResult.landmarks ?? []) as NormalizedLandmark[][];
        const mar = faceLandmarks ? mouthAspectRatio(faceLandmarks) : null;
        if (isTongueHeuristic(mar)) {
          tongueFramesRef.current += 1;
        } else {
          tongueFramesRef.current = 0;
        }

        const monitor = monitoringCueRef.current;
        if (monitor) {
          if (!isPersistentMonitoringActive(monitor, currentMs)) {
            releasePersistentMonitor();
            if (phaseRef.current === 'keep_action') {
              phaseRef.current = 'playing';
              setPhase('playing');
              if (isMobilePlaybackPolicy()) {
                setNeedsTapToPlay(true);
                allowAutoResumeRef.current = false;
              } else {
                void playback.play().catch(() => undefined);
              }
            }
          } else if (phaseRef.current === 'playing' && !playback.paused) {
            const ok = detectCommandSuccess(
              monitor.commandType,
              faceLandmarks,
              handLandmarks,
              tongueFramesRef.current,
            );
            if (ok) {
              persistentMissFramesRef.current = 0;
            } else {
              persistentMissFramesRef.current += 1;
              if (persistentMissFramesRef.current >= PERSISTENT_MISS_FRAMES) {
                allowAutoResumeRef.current = false;
                persistentMissFramesRef.current = 0;
                playback.pause();
                setActiveCue(monitor);
                setOverlayMessage(CUE_KEEP_LABELS[monitor.commandType]);
                phaseRef.current = 'keep_action';
                setPhase('keep_action');
              }
            }
          }
        }

        const cue =
          activeCue ??
          (phaseRef.current === 'keep_action' ? monitoringCueRef.current : null);

        if (
          cue &&
          (phaseRef.current === 'awaiting_action' || phaseRef.current === 'keep_action')
        ) {
          const ok = detectCommandSuccess(
            cue.commandType,
            faceLandmarks,
            handLandmarks,
            tongueFramesRef.current,
          );
          if (ok) {
            resumeAfterCue(cue);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [
    started,
    cameraReady,
    modelsReady,
    phase,
    activeCue,
    resumeAfterCue,
    releasePersistentMonitor,
    checkForCueAtTime,
  ]);

  useEffect(() => {
    const el = playbackRef.current;
    if (!el || !playbackUrl) return;

    const onLoadedMetadata = () => {
      if (playbackPrimedRef.current || started) return;
      playbackPrimedRef.current = true;
      if (el.currentTime !== 0) el.currentTime = 0;
      el.pause();
    };

    const onCanPlay = () => {
      const restore = pendingRestoreRef.current;
      if (restore) {
        pendingRestoreRef.current = null;
        el.currentTime = restore.currentTime;
        if (restore.play && !isMobilePlaybackPolicy()) {
          allowAutoResumeRef.current = true;
          void el.play().catch(() => undefined);
        } else if (restore.play) {
          setNeedsTapToPlay(true);
        }
      }
      markMediaReady();
    };

    const onLoadedData = () => {
      markMediaReady();
    };

    const onError = () => {
      const code = el.error?.code;
      const detail =
        code === MediaError.MEDIA_ERR_NETWORK
          ? 'Network error while loading the video.'
          : code === MediaError.MEDIA_ERR_DECODE
            ? 'Could not decode this video.'
            : 'Video failed to load.';
      setLoadError(detail);
    };

    const onWaiting = () => {
      if (allowAutoResumeRef.current && phaseRef.current === 'playing') {
        setBuffering(true);
      }
    };

    const onPlaying = () => {
      setBuffering(false);
    };

    const onStalled = () => {
      if (allowAutoResumeRef.current && phaseRef.current === 'playing') {
        setBuffering(true);
      }
    };

    const onEnded = () => {
      monitoringCueRef.current = null;
      setActiveCue(null);
      phaseRef.current = 'done';
      setPhase('done');
    };

    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('loadeddata', onLoadedData);
    el.addEventListener('error', onError);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('stalled', onStalled);
    el.addEventListener('ended', onEnded);

    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      markMediaReady();
    }

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('loadeddata', onLoadedData);
      el.removeEventListener('error', onError);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('stalled', onStalled);
      el.removeEventListener('ended', onEnded);
    };
  }, [playbackUrl, started, markMediaReady]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      const el = playbackRef.current;
      if (
        !el ||
        !allowAutoResumeRef.current ||
        phaseRef.current !== 'playing' ||
        !el.paused ||
        isMobilePlaybackPolicy()
      ) {
        return;
      }
      void el.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (loadError || cameraError) {
    return (
      <div className="interactive-video-player">
        <p className="login-error" role="alert">
          {loadError || cameraError}
        </p>
        {loadError && (
          <button type="button" className="btn btn--primary" onClick={retryPlaybackUrl}>
            Retry loading video
          </button>
        )}
        <Link to="/videos/interactive" className="btn btn--ghost">
          Back to interactive videos
        </Link>
      </div>
    );
  }

  const showOverlay =
    (phase === 'awaiting_action' || phase === 'keep_action') && overlayMessage;

  return (
    <div className="interactive-video-player">
      <div className="interactive-video-player__header">
        <Link to="/videos/interactive" className="btn btn--ghost btn--sm">
          ← Back
        </Link>
        <h2>{video.title}</h2>
      </div>

      {!started && (
        <div className="interactive-video-player__warning card" role="note">
          <strong>Camera required</strong>
          <p className="muted">
            Interactive videos pause at cue points and use your camera to verify actions
            (sniff, open mouth, tongue out). Grant camera permission when prompted.
          </p>
        </div>
      )}

      <div
        ref={stageRef}
        className={`interactive-video-player__stage${pseudoFullscreen ? ' interactive-video-player__stage--pseudo-fullscreen' : ''}`}
      >
        <video
          ref={playbackRef}
          className="interactive-video-player__playback"
          playsInline
          preload="auto"
          controlsList="nodownload"
          disablePictureInPicture
        />
        {(urlLoading || !mediaReady) && !loadError && (
          <p className="muted interactive-video-player__loading">Loading video…</p>
        )}
        {started && buffering && phase === 'playing' && (
          <p className="muted interactive-video-player__loading" aria-live="polite">
            Buffering…
          </p>
        )}

        {showOverlay && overlayMessage && (
          <div className="interactive-video-player__overlay" role="status" aria-live="polite">
            <p className="interactive-video-player__command">{overlayMessage}</p>
          </div>
        )}

        {needsTapToPlay && started && (
          <button
            type="button"
            className="interactive-video-player__tap-overlay btn btn--primary"
            onClick={handleTapToContinue}
            aria-label="Tap to continue playback"
          >
            Tap to continue
          </button>
        )}

        {mediaReady && (
          <button
            type="button"
            className="interactive-video-player__fullscreen-btn btn btn--ghost btn--sm"
            onClick={handleFullscreenClick}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        )}

        <video
          ref={cameraRef}
          className="interactive-video-player__camera"
          playsInline
          muted
          autoPlay
          aria-hidden="true"
        />

        {cameraReady && (
          <PrivacyNotice
            variant="camera"
            className="privacy-notice--camera-overlay interactive-video-player__privacy"
          />
        )}
      </div>

      <div className="interactive-video-player__controls">
        {!started ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={!mediaReady || !cameraReady || !modelsReady}
            onClick={handleStartClick}
          >
            {urlLoading || !mediaReady
              ? 'Loading…'
              : !cameraReady || !modelsReady
                ? 'Preparing camera…'
                : 'Start interactive playback'}
          </button>
        ) : phase === 'done' ? (
          <button type="button" className="btn btn--primary" onClick={resetSession}>
            Play again
          </button>
        ) : (
          <p className="muted">
            {sortedCues.length} cue{sortedCues.length === 1 ? '' : 's'} · {firedCount} triggered
          </p>
        )}
      </div>

      {isAdmin && sortedCues.length > 0 && (
        <details className="interactive-video-player__cue-list">
          <summary>Cue timeline</summary>
          <ul>
            {sortedCues.map((cue) => (
              <li key={cue.id}>
                {formatTimeMs(cue.timeMs)}
                {cue.persistent && cue.endTimeMs != null
                  ? ` → ${formatTimeMs(cue.endTimeMs)}`
                  : ''}{' '}
                — {CUE_COMMAND_LABELS[cue.commandType]}
                {cue.persistent
                  ? cue.endTimeMs != null
                    ? ' (persistent range)'
                    : ' (persistent)'
                  : ' (quick)'}
                {firedCueIdsRef.current.has(cue.id) ? ' ✓' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
