import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { useAppStore } from '../hooks/useAppStore';

interface Bubble {
  id: number;
  x: number;
  startY: number;
  size: number;
  duration: number;
  wobble: number;
}

interface PopEffect {
  id: number;
  x: number;
  y: number;
  label: string;
}

const POP_LABELS = [
  'Good Girl',
  'Obey',
  'Listen',
  'Deeper',
  'Sink',
] as const;

const MAX_BUBBLES = 8;
const POP_DURATION_MS = 600;
const BUBBLE_POP_SRC = '/sounds/bubble-pop.mp3';
const BUBBLE_POP_VOLUME = 0.7;

let nextId = 0;
let bubblePopTemplate: HTMLAudioElement | null = null;
let bubblePopMp3Ok: boolean | null = null;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function getBubblePopTemplate(): HTMLAudioElement {
  if (!bubblePopTemplate) {
    bubblePopTemplate = new Audio(BUBBLE_POP_SRC);
    bubblePopTemplate.preload = 'auto';
    bubblePopTemplate.volume = BUBBLE_POP_VOLUME;
  }
  return bubblePopTemplate;
}

function playWebAudioPopSound(ctx: AudioContext | null) {
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const t = ctx.currentTime;
    const pitchVar = rand(0.86, 1.14);
    const popLen = rand(0.085, 0.13);
    const startFreq = rand(720, 1080) * pitchVar;
    const endFreq = rand(52, 88) * pitchVar;

    const master = ctx.createGain();
    master.gain.value = 0.82;

    const dryMix = ctx.createGain();
    dryMix.gain.value = 1;

    const delay = ctx.createDelay(0.06);
    delay.delayTime.value = rand(0.02, 0.034);
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2600;
    delayFilter.Q.value = 0.6;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = rand(0.14, 0.24);
    const wetSend = ctx.createGain();
    wetSend.gain.value = rand(0.16, 0.26);

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.linearRampToValueAtTime(rand(0.13, 0.19), t + rand(0.005, 0.009));
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + popLen);
    bodyOsc.frequency.setValueAtTime(startFreq, t);
    bodyOsc.frequency.exponentialRampToValueAtTime(
      Math.max(endFreq, 24),
      t + popLen * 0.82,
    );
    bodyOsc.connect(bodyGain);
    bodyGain.connect(dryMix);
    bodyOsc.start(t);
    bodyOsc.stop(t + popLen + 0.03);

    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    const shimmerGain = ctx.createGain();
    const shimStart = startFreq * rand(1.35, 1.75);
    shimmer.frequency.setValueAtTime(shimStart, t);
    shimmer.frequency.exponentialRampToValueAtTime(
      Math.max(endFreq * 1.15, 30),
      t + popLen * 0.55,
    );
    shimmerGain.gain.setValueAtTime(0.0001, t);
    shimmerGain.gain.linearRampToValueAtTime(rand(0.035, 0.065), t + 0.004);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + popLen * 0.58);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(dryMix);
    shimmer.start(t);
    shimmer.stop(t + popLen * 0.65);

    const noiseDur = rand(0.028, 0.048);
    const bufferSize = Math.floor(ctx.sampleRate * noiseDur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      const env = (1 - i / bufferSize) ** 1.75;
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = rand(1100, 2400) * pitchVar;
    noiseFilter.Q.value = rand(0.55, 1.15);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.linearRampToValueAtTime(rand(0.08, 0.13), t + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + noiseDur);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dryMix);
    noise.start(t);

    const clickSize = Math.floor(ctx.sampleRate * 0.012);
    const clickBuf = ctx.createBuffer(1, clickSize, ctx.sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickSize; i += 1) {
      clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickSize) ** 2.2;
    }
    const click = ctx.createBufferSource();
    click.buffer = clickBuf;
    const clickHp = ctx.createBiquadFilter();
    clickHp.type = 'highpass';
    clickHp.frequency.value = rand(3200, 5200);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, t);
    clickGain.gain.linearRampToValueAtTime(rand(0.04, 0.07), t + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    click.connect(clickHp);
    clickHp.connect(clickGain);
    clickGain.connect(dryMix);
    click.start(t);

    dryMix.connect(master);
    dryMix.connect(wetSend);
    wetSend.connect(delay);
    delay.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(master);
    master.connect(ctx.destination);
  } catch {
    // Audio unavailable — silent pop is fine.
  }
}

function playPopSound(getCtx: () => AudioContext | null) {
  if (bubblePopMp3Ok !== false) {
    try {
      const audio = getBubblePopTemplate().cloneNode() as HTMLAudioElement;
      audio.volume = BUBBLE_POP_VOLUME;
      const fallback = () => {
        bubblePopMp3Ok = false;
        playWebAudioPopSound(getCtx());
      };
      audio.addEventListener('error', fallback, { once: true });
      void audio.play().then(() => {
        bubblePopMp3Ok = true;
      }).catch(fallback);
      return;
    } catch {
      bubblePopMp3Ok = false;
    }
  }
  playWebAudioPopSound(getCtx());
}

export function SoapBubbleField() {
  const { recordSoapBubblePop } = useAppStore();
  const bubblesRef = useRef<Bubble[]>([]);
  const spawnTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [pops, setPops] = useState<PopEffect[]>([]);

  const syncFromRef = useCallback(() => {
    setBubbles([...bubblesRef.current]);
  }, []);

  const removeBubble = useCallback(
    (id: number) => {
      bubblesRef.current = bubblesRef.current.filter((b) => b.id !== id);
      syncFromRef();
    },
    [syncFromRef],
  );

  const spawnBubble = useCallback(() => {
    if (bubblesRef.current.length >= MAX_BUBBLES) return;

    const bubble: Bubble = {
      id: nextId++,
      x: rand(5, 95),
      startY: Math.random() < 0.65 ? 100 : rand(55, 98),
      size: rand(28, 54),
      duration: rand(15, 25),
      wobble: rand(8, 22),
    };

    bubblesRef.current = [...bubblesRef.current, bubble];
    syncFromRef();
  }, [syncFromRef]);

  const handleBubbleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, bubble: Bubble) => {
      event.preventDefault();
      event.stopPropagation();

      playPopSound(() => {
        if (!audioCtxRef.current) {
          const AudioCtx =
            window.AudioContext ||
            (window as Window & { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
          if (AudioCtx) {
            audioCtxRef.current = new AudioCtx();
          }
        }
        return audioCtxRef.current;
      });

      const rect = event.currentTarget.getBoundingClientRect();
      const label =
        POP_LABELS[Math.floor(Math.random() * POP_LABELS.length)];

      const pop: PopEffect = {
        id: nextId++,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        label,
      };

      setPops((prev) => [...prev, pop]);
      removeBubble(bubble.id);
      recordSoapBubblePop();

      window.setTimeout(() => {
        setPops((prev) => prev.filter((p) => p.id !== pop.id));
      }, POP_DURATION_MS);
    },
    [removeBubble, recordSoapBubblePop],
  );

  useEffect(() => {
    const scheduleSpawn = () => {
      spawnTimerRef.current = window.setTimeout(() => {
        spawnBubble();
        scheduleSpawn();
      }, rand(3000, 8000));
    };

    scheduleSpawn();
    spawnBubble();

    return () => {
      if (spawnTimerRef.current !== null) {
        window.clearTimeout(spawnTimerRef.current);
      }
    };
  }, [spawnBubble]);

  useEffect(
    () => () => {
      void audioCtxRef.current?.close();
    },
    [],
  );

  return (
    <div className="soap-bubble-field" aria-hidden>
      {bubbles.map((bubble) => (
        <button
          key={bubble.id}
          type="button"
          className="soap-bubble"
          style={
            {
              left: `${bubble.x}%`,
              top: `${bubble.startY}vh`,
              width: bubble.size,
              height: bubble.size,
              '--float-duration': `${bubble.duration}s`,
              '--wobble-amplitude': `${bubble.wobble}px`,
            } as CSSProperties
          }
          onClick={(event) => handleBubbleClick(event, bubble)}
          onAnimationEnd={() => removeBubble(bubble.id)}
        />
      ))}
      {pops.map((pop) => (
        <span
          key={pop.id}
          className="soap-pop"
          style={{ left: pop.x, top: pop.y }}
        >
          {pop.label}
        </span>
      ))}
    </div>
  );
}
