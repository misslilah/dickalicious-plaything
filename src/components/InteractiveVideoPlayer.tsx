import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
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

const MEDIAPIPE_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const TONGUE_HOLD_FRAMES = 6;
const CUE_TOLERANCE_MS = 120;

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

  const [mediaReady, setMediaReady] = useState(false);
  const [urlLoading, setUrlLoading] = useState(true);

  pseudoFullscreenRef.current = pseudoFullscreen;

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

  const resetSession = useCallback(() => {
    firedCueIdsRef.current = new Set();
    monitoringCueRef.current = null;
    tongueFramesRef.current = 0;
    setActiveCue(null);
    setOverlayMessage('');
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
  }, [video.id, video.storagePath]);

  useEffect(() => {
    const el = playbackRef.current;
    if (!el || !playbackUrl) return;
    const sourceKey = playbackSourceKeyRef.current;
    try {
      const resolved = new URL(playbackUrl, window.location.href).href;
      if (el.src !== resolved) {
        playbackPrimedRef.current = false;
        mediaReadyRef.current = false;
        setMediaReady(false);
        el.src = playbackUrl;
        el.load();
      }
    } catch {
      if (el.getAttribute('src') !== playbackUrl) {
        playbackPrimedRef.current = false;
        mediaReadyRef.current = false;
        setMediaReady(false);
        el.src = playbackUrl;
        el.load();
      }
    }
    return () => {
      if (playbackSourceKeyRef.current !== sourceKey) return;
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [playbackUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        if (cancelled) return;
        const [faceLandmarker, handLandmarker] = await Promise.all([
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: false,
          }),
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 2,
          }),
        ]);
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

    void el.play().catch(() => {
      setLoadError('Could not resume playback.');
    });
  }, []);

  const startPlayback = useCallback(() => {
    const el = playbackRef.current;
    if (!el || !playbackUrl) return;
    firedCueIdsRef.current = new Set();
    monitoringCueRef.current = null;
    tongueFramesRef.current = 0;
    setActiveCue(null);
    setOverlayMessage('');
    setFiredCount(0);
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
    void el.play().catch(() => {
      setLoadError('Could not start playback.');
    });
  }, [playbackUrl, sortedCues, triggerCue]);

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
              void playback.play();
            }
          } else if (phaseRef.current === 'playing' && !playback.paused) {
            const ok = detectCommandSuccess(
              monitor.commandType,
              faceLandmarks,
              handLandmarks,
              tongueFramesRef.current,
            );
            if (!ok) {
              playback.pause();
              setActiveCue(monitor);
              setOverlayMessage(CUE_KEEP_LABELS[monitor.commandType]);
              phaseRef.current = 'keep_action';
              setPhase('keep_action');
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
    if (!el) return;

    const onLoadedMetadata = () => {
      if (playbackPrimedRef.current || started) return;
      playbackPrimedRef.current = true;
      if (el.currentTime !== 0) el.currentTime = 0;
      el.pause();
    };

    const onCanPlay = () => {
      if (mediaReadyRef.current) return;
      mediaReadyRef.current = true;
      setMediaReady(true);
      if (phaseRef.current === 'loading') {
        phaseRef.current = 'ready';
        setPhase('ready');
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
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('ended', onEnded);
    };
  }, [started]);

  if (loadError || cameraError) {
    return (
      <div className="interactive-video-player">
        <p className="login-error" role="alert">
          {loadError || cameraError}
        </p>
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
          preload="metadata"
          controlsList="nodownload"
          disablePictureInPicture
        />
        {(urlLoading || !mediaReady) && !loadError && (
          <p className="muted interactive-video-player__loading">Loading video…</p>
        )}

        {showOverlay && overlayMessage && (
          <div className="interactive-video-player__overlay" role="status" aria-live="polite">
            <p className="interactive-video-player__command">{overlayMessage}</p>
          </div>
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
      </div>

      <div className="interactive-video-player__controls">
        {!started ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={!mediaReady || !cameraReady || !modelsReady}
            onClick={() => void startPlayback()}
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
