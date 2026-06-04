import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  areEyesClosed,
  eyeAspectRatio,
  isMouthOpen,
  isTongueHeuristic,
  mouthAspectRatio,
  type NormalizedLandmark,
} from '../lib/facePoseDetection';
import {
  FOLLOW_INSTINCT_ORDER_LABELS,
  type FollowInstinctGame,
  type FollowInstinctRound,
} from '../lib/followInstinctGames';
import {
  fetchMiniGameUserBestStreak,
  upsertMiniGameBestStreak,
} from '../lib/miniGameLeaderboardDb';
import { PrivacyNotice } from './PrivacyNotice';

const MEDIAPIPE_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const MAX_ROUNDS_PER_SESSION = 8;
const ORDER_REVEAL_DELAY_MS = 3000;
const COMMAND_WINDOW_MS = 4500;
const TONGUE_HOLD_FRAMES = 6;
const EYES_CLOSED_HOLD_FRAMES = 8;
const SUCCESS_ADVANCE_MS = 900;
const FAIL_ADVANCE_MS = 1200;

function shuffleRounds(pool: FollowInstinctRound[]): FollowInstinctRound[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildSessionQueue(pool: FollowInstinctRound[]): FollowInstinctRound[] {
  if (pool.length === 0) return [];
  const target = Math.min(MAX_ROUNDS_PER_SESSION, pool.length);
  return shuffleRounds(pool).slice(0, target);
}

function displayOrderText(round: FollowInstinctRound): string {
  const text = round.orderText.trim();
  return text || FOLLOW_INSTINCT_ORDER_LABELS[round.orderType];
}

function validateRound(
  round: FollowInstinctRound,
  landmarks: NormalizedLandmark[],
  tongueFrameCount: number,
  eyesClosedFrameCount: number,
): boolean {
  const mar = mouthAspectRatio(landmarks);
  const ear = eyeAspectRatio(landmarks);
  switch (round.orderType) {
    case 'close_eyes':
      return areEyesClosed(ear) && eyesClosedFrameCount >= EYES_CLOSED_HOLD_FRAMES;
    case 'open_mouth':
      return isMouthOpen(mar);
    case 'tongue_out':
      return isTongueHeuristic(mar) && tongueFrameCount >= TONGUE_HOLD_FRAMES;
    default:
      return false;
  }
}

interface FollowInstinctGamePlayerProps {
  game: FollowInstinctGame;
}

export function FollowInstinctGamePlayer({ game }: FollowInstinctGamePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tongueFramesRef = useRef(0);
  const eyesClosedFramesRef = useRef(0);
  const sessionQueueRef = useRef<FollowInstinctRound[]>([]);
  const advanceTimeoutRef = useRef<number | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [roundIndex, setRoundIndex] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [activeRound, setActiveRound] = useState<FollowInstinctRound | null>(null);
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'fail'>('idle');
  const [streak, setStreak] = useState(0);
  const [sessionBestStreak, setSessionBestStreak] = useState(0);
  const [allTimeBestStreak, setAllTimeBestStreak] = useState(0);
  const sessionBestStreakRef = useRef(0);
  const persistSessionBestStreakRef = useRef<() => void>(() => {});
  const [sessionDone, setSessionDone] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [orderRevealed, setOrderRevealed] = useState(false);
  const roundStartRef = useRef(0);
  const judgedRef = useRef(false);

  const playableRounds = useMemo(() => game.rounds, [game.rounds]);
  const sessionActive = !sessionDone && activeRound !== null;

  const clearAdvanceTimeout = useCallback(() => {
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current);
      advanceTimeoutRef.current = null;
    }
  }, []);

  const persistSessionBestStreak = useCallback(() => {
    const best = sessionBestStreakRef.current;
    if (best <= 0) return;
    void (async () => {
      const result = await upsertMiniGameBestStreak('follow_instinct', game.id, best);
      if (result.ok && best > allTimeBestStreak) {
        setAllTimeBestStreak(best);
      }
    })();
  }, [allTimeBestStreak, game.id]);

  persistSessionBestStreakRef.current = persistSessionBestStreak;

  const recordStreak = useCallback(
    (next: number) => {
      if (next > sessionBestStreakRef.current) {
        sessionBestStreakRef.current = next;
        setSessionBestStreak(next);
        if (next > allTimeBestStreak) {
          void (async () => {
            const result = await upsertMiniGameBestStreak('follow_instinct', game.id, next);
            if (result.ok) setAllTimeBestStreak(next);
          })();
        }
      }
    },
    [allTimeBestStreak, game.id],
  );

  const startRound = useCallback(
    (index: number) => {
      const queue = sessionQueueRef.current;
      if (queue.length === 0) return;
      clearAdvanceTimeout();
      if (index >= queue.length) {
        persistSessionBestStreak();
        setSessionDone(true);
        setActiveRound(null);
        setDetecting(false);
        setOrderRevealed(false);
        setFeedback('idle');
        return;
      }
      setRoundIndex(index);
      setActiveRound(queue[index]);
      setFeedback('idle');
      setOrderRevealed(false);
      judgedRef.current = false;
      tongueFramesRef.current = 0;
      eyesClosedFramesRef.current = 0;
      setDetecting(false);
    },
    [clearAdvanceTimeout, persistSessionBestStreak],
  );

  const scheduleAdvance = useCallback(
    (index: number, delayMs: number) => {
      clearAdvanceTimeout();
      advanceTimeoutRef.current = window.setTimeout(() => {
        advanceTimeoutRef.current = null;
        startRound(index + 1);
      }, delayMs);
    },
    [clearAdvanceTimeout, startRound],
  );

  const goToNextRound = useCallback(() => {
    startRound(roundIndex + 1);
  }, [roundIndex, startRound]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchMiniGameUserBestStreak('follow_instinct', game.id);
      if (cancelled || !result.ok) return;
      setAllTimeBestStreak(result.bestStreak);
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  useEffect(() => {
    return () => {
      clearAdvanceTimeout();
      persistSessionBestStreakRef.current();
    };
  }, [clearAdvanceTimeout]);

  useEffect(() => {
    if (playableRounds.length === 0) return;
    const queue = buildSessionQueue(playableRounds);
    sessionQueueRef.current = queue;
    setSessionTotal(queue.length);
    startRound(0);
    // game.id only: remount/Strict Mode must restart session; avoid restart when startRound identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playableRounds + startRound read at game open
  }, [game.id]);

  useEffect(() => {
    if (!sessionActive) {
      setOrderRevealed(false);
      return;
    }
    setOrderRevealed(false);
    setDetecting(false);
    const timerId = window.setTimeout(() => {
      roundStartRef.current = performance.now();
      setOrderRevealed(true);
      setDetecting(true);
    }, ORDER_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timerId);
  }, [roundIndex, sessionActive, activeRound?.imagePath]);

  useEffect(() => {
    let cancelled = false;

    const createLandmarker = async (
      vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
      delegate: 'GPU' | 'CPU',
    ) =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_MODEL,
          delegate,
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
      });

    void (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        if (cancelled) return;
        let landmarker: FaceLandmarker;
        try {
          landmarker = await createLandmarker(vision, 'GPU');
        } catch {
          landmarker = await createLandmarker(vision, 'CPU');
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setModelReady(true);
      } catch {
        if (!cancelled) {
          setCameraError('Could not load face detection. Check your connection and retry.');
        }
      }
    })();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
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
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraReady(true);
      } catch {
        if (!cancelled) {
          setCameraError('Camera access is required to play this game.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cameraReady || !modelReady || !detecting || !activeRound || sessionDone) return;

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;

    const tick = () => {
      if (!detecting || judgedRef.current || !activeRound) return;
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const landmarks = result.faceLandmarks[0] as NormalizedLandmark[] | undefined;

      if (landmarks) {
        const mar = mouthAspectRatio(landmarks);
        if (isTongueHeuristic(mar)) {
          tongueFramesRef.current += 1;
        } else {
          tongueFramesRef.current = 0;
        }

        const ear = eyeAspectRatio(landmarks);
        if (areEyesClosed(ear)) {
          eyesClosedFramesRef.current += 1;
        } else {
          eyesClosedFramesRef.current = 0;
        }

        if (
          validateRound(
            activeRound,
            landmarks,
            tongueFramesRef.current,
            eyesClosedFramesRef.current,
          )
        ) {
          judgedRef.current = true;
          setDetecting(false);
          setFeedback('success');
          setStreak((value) => {
            const next = value + 1;
            recordStreak(next);
            return next;
          });
          scheduleAdvance(roundIndex, SUCCESS_ADVANCE_MS);
        }
      }

      if (!judgedRef.current && now - roundStartRef.current >= COMMAND_WINDOW_MS) {
        judgedRef.current = true;
        setDetecting(false);
        setFeedback('fail');
        setStreak(0);
        scheduleAdvance(roundIndex, FAIL_ADVANCE_MS);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [
    cameraReady,
    modelReady,
    detecting,
    activeRound,
    roundIndex,
    sessionDone,
    scheduleAdvance,
    recordStreak,
  ]);

  const displayedBestStreak = Math.max(sessionBestStreak, allTimeBestStreak);
  const roundsLabel = sessionTotal > 0 ? sessionTotal : MAX_ROUNDS_PER_SESSION;

  if (cameraError) {
    return (
      <p className="login-error" role="alert">
        {cameraError}
      </p>
    );
  }

  if (playableRounds.length === 0) {
    return (
      <p className="login-error" role="alert">
        This game has no playable rounds. Ask an admin to add photo + order pairs.
      </p>
    );
  }

  return (
    <div className="follow-instinct-player">
      <div className="follow-instinct-player__stats">
        <span>
          Round {Math.min(roundIndex + 1, roundsLabel)} / {roundsLabel}
        </span>
        <span className="follow-instinct-player__streak">
          Streak: <strong>{streak}</strong>
          {displayedBestStreak > 0 && (
            <>
              {' '}
              · Best: <strong>{displayedBestStreak}</strong>
            </>
          )}
        </span>
      </div>

      {cameraReady && <PrivacyNotice variant="camera" />}

      {sessionDone ? (
        <div className="follow-instinct-player__done">
          <p className="follow-instinct-player__done-title">Session complete</p>
          <p className="muted">
            You finished {sessionTotal} round{sessionTotal === 1 ? '' : 's'}. Play again from Mini
            Games.
          </p>
        </div>
      ) : (
        <>
          {activeRound && (
            <>
              <div className="follow-instinct-player__photo-wrap">
                <img
                  src={activeRound.imageUrl}
                  alt=""
                  className="follow-instinct-player__photo"
                  loading="eager"
                  decoding="async"
                />
              </div>
              {orderRevealed && (
                <p
                  className="follow-instinct-player__order follow-instinct-player__order--visible"
                  aria-live="polite"
                >
                  {displayOrderText(activeRound)}
                </p>
              )}
            </>
          )}
          {feedback === 'success' && (
            <p className="follow-instinct-player__feedback follow-instinct-player__feedback--ok">
              Correct!
            </p>
          )}
          {feedback === 'fail' && (
            <p className="follow-instinct-player__feedback follow-instinct-player__feedback--fail">
              Not quite — next round
            </p>
          )}
          {feedback !== 'idle' && (
            <div className="follow-instinct-player__advance">
              <button type="button" className="btn btn--primary" onClick={goToNextRound}>
                Next
              </button>
            </div>
          )}
        </>
      )}

      <div className="follow-instinct-player__camera" aria-hidden="true">
        <video
          ref={videoRef}
          className="follow-instinct-player__video"
          playsInline
          muted
          autoPlay
        />
      </div>

      {!sessionDone && (!cameraReady || (!modelReady && cameraReady)) && (
        <p className="follow-instinct-player__status muted" aria-live="polite">
          {!cameraReady ? 'Starting camera…' : 'Loading face detection…'}
        </p>
      )}

      {!sessionDone && orderRevealed && feedback === 'idle' && (
        <p className="muted follow-instinct-player__hint">
          Perform the action shown above with your face. Tongue detection is approximate (wide open
          mouth).
        </p>
      )}
    </div>
  );
}
