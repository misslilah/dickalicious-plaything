import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  headYawRatio,
  isLookingLeft,
  isLookingRight,
  isMouthOpen,
  isTongueHeuristic,
  mouthAspectRatio,
  type NormalizedLandmark,
} from '../lib/facePoseDetection';
import type { FollowInstinctGame } from '../lib/followInstinctGames';

const MEDIAPIPE_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const ROUNDS_PER_SESSION = 8;
const COMMAND_WINDOW_MS = 3500;
const TONGUE_HOLD_FRAMES = 6;

export type InstinctCommand = 'look_left' | 'look_right' | 'open_mouth' | 'tongue_out';

const COMMAND_LABELS: Record<InstinctCommand, string> = {
  look_left: 'Look left',
  look_right: 'Look right',
  open_mouth: 'Open your mouth',
  tongue_out: 'Stick your tongue out',
};

function commandLabel(command: InstinctCommand): string {
  return COMMAND_LABELS[command];
}

function randomCommand(): InstinctCommand {
  const pool: InstinctCommand[] = [
    'look_left',
    'look_right',
    'open_mouth',
    'tongue_out',
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function heartSideForCommand(command: InstinctCommand): 'left' | 'right' {
  if (command === 'look_left') return 'left';
  if (command === 'look_right') return 'right';
  return Math.random() < 0.5 ? 'left' : 'right';
}

function validateCommand(
  command: InstinctCommand,
  landmarks: NormalizedLandmark[],
  tongueFrameCount: number,
): boolean {
  const yaw = headYawRatio(landmarks);
  const mar = mouthAspectRatio(landmarks);
  switch (command) {
    case 'look_left':
      return isLookingLeft(yaw);
    case 'look_right':
      return isLookingRight(yaw);
    case 'open_mouth':
      return isMouthOpen(mar);
    case 'tongue_out':
      // Best-effort: wide mouth held briefly — not true tongue detection.
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

  const [cameraReady, setCameraReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [roundIndex, setRoundIndex] = useState(0);
  const [command, setCommand] = useState<InstinctCommand | null>(null);
  const [heartSide, setHeartSide] = useState<'left' | 'right'>('left');
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'fail'>('idle');
  const [streak, setStreak] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const roundStartRef = useRef(0);
  const judgedRef = useRef(false);

  const startRound = useCallback((index: number) => {
    if (index >= ROUNDS_PER_SESSION) {
      setSessionDone(true);
      setCommand(null);
      setDetecting(false);
      return;
    }
    const nextCommand = randomCommand();
    setRoundIndex(index);
    setCommand(nextCommand);
    setHeartSide(heartSideForCommand(nextCommand));
    setFeedback('idle');
    judgedRef.current = false;
    tongueFramesRef.current = 0;
    roundStartRef.current = performance.now();
    setDetecting(true);
  }, []);

  useEffect(() => {
    startRound(0);
  }, [startRound]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        if (cancelled) return;
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_MODEL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
        });
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
    if (!cameraReady || !modelReady || !detecting || !command || sessionDone) return;

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;

    const tick = () => {
      if (!detecting || judgedRef.current || !command) return;
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

        if (validateCommand(command, landmarks, tongueFramesRef.current)) {
          judgedRef.current = true;
          setDetecting(false);
          setFeedback('success');
          setStreak((value) => value + 1);
          window.setTimeout(() => startRound(roundIndex + 1), 900);
        }
      }

      if (!judgedRef.current && now - roundStartRef.current >= COMMAND_WINDOW_MS) {
        judgedRef.current = true;
        setDetecting(false);
        setFeedback('fail');
        setStreak(0);
        window.setTimeout(() => startRound(roundIndex + 1), 1200);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraReady, modelReady, detecting, command, roundIndex, sessionDone, startRound]);

  if (cameraError) {
    return (
      <p className="login-error" role="alert">
        {cameraError}
      </p>
    );
  }

  return (
    <div className="follow-instinct-player">
      <div className="follow-instinct-player__stats">
        <span>
          Round {Math.min(roundIndex + 1, ROUNDS_PER_SESSION)} / {ROUNDS_PER_SESSION}
        </span>
        <span className="follow-instinct-player__streak">
          Streak: <strong>{streak}</strong>
        </span>
      </div>

      {sessionDone ? (
        <div className="follow-instinct-player__done">
          <p className="follow-instinct-player__done-title">Session complete</p>
          <p className="muted">You finished {ROUNDS_PER_SESSION} rounds. Play again from Mini Games.</p>
        </div>
      ) : (
        <>
          {command && (
            <p className="follow-instinct-player__command" aria-live="polite">
              {commandLabel(command)}
            </p>
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

      {(!cameraReady || (!modelReady && cameraReady)) && (
        <p className="follow-instinct-player__status muted" aria-live="polite">
          {!cameraReady ? 'Starting camera…' : 'Loading face detection…'}
        </p>
      )}

      <div className="follow-instinct-player__stage">
        <div className="follow-instinct-player__panel follow-instinct-player__panel--left">
          <img src={game.leftImageUrl} alt="" className="follow-instinct-player__panel-img" />
          {heartSide === 'left' && (
            <span className="follow-instinct-player__heart" aria-hidden="true">
              ♥
            </span>
          )}
        </div>

        <div className="follow-instinct-player__panel follow-instinct-player__panel--right">
          <img src={game.rightImageUrl} alt="" className="follow-instinct-player__panel-img" />
          {heartSide === 'right' && (
            <span className="follow-instinct-player__heart" aria-hidden="true">
              ♥
            </span>
          )}
        </div>
      </div>

      <p className="muted follow-instinct-player__hint">
        Follow each command using your face. Tongue detection is approximate (wide open mouth).
      </p>
    </div>
  );
}
