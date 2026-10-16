import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { playFocusTrainingBell } from '../lib/focusTrainingBell';

export const GAME_WINDOW_CELEBRATION_MS = 2600;
export const FOCUS_TRAINING_CELEBRATION_MS = GAME_WINDOW_CELEBRATION_MS;
const FADE_MS = 380;

const PALETTES = [
  ['#ff4fbf', '#e879f9', '#c084fc', '#ffe08a', '#ffffff'],
  ['#f5c84c', '#ffe08a', '#fb923c', '#ffffff', '#ff4fbf'],
  ['#38bdf8', '#c084fc', '#e879f9', '#ffffff', '#7dd3fc'],
  ['#4ade80', '#a78bfa', '#f5c84c', '#ffffff', '#34d399'],
  ['#fb7185', '#f472b6', '#f5c84c', '#ffffff', '#fda4af'],
  ['#c084fc', '#818cf8', '#67e8f9', '#ffffff', '#e879f9'],
];

type Side = 'top' | 'right' | 'bottom' | 'left';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  spark: boolean;
};

type BurstPlan = {
  at: number;
  side: Side;
  along: number;
  count: number;
  power: number;
};

type Show = {
  palette: string[];
  intensity: number;
  scale: number;
  speed: number;
  duration: number;
  spiralArms: number;
  spiralTurns: number;
  rotationDir: 1 | -1;
  bursts: BurstPlan[];
};

interface GameWindowCelebrationProps {
  playId: number;
  panelRef: RefObject<HTMLElement | null>;
  headerRef?: RefObject<HTMLElement | null>;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function rand(): number {
  return Math.random();
}

function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function buildShow(): Show {
  const sides = shuffle<Side>(['top', 'right', 'bottom', 'left']).slice(
    0,
    1 + Math.floor(rand() * 4),
  );
  const burstCount = 4 + Math.floor(rand() * 7);
  const bursts: BurstPlan[] = [];
  for (let i = 0; i < burstCount; i += 1) {
    bursts.push({
      at: 30 + i * (70 + rand() * 90),
      side: pick(sides),
      along: 0.08 + rand() * 0.84,
      count: 14 + Math.floor(rand() * 22),
      power: 1.8 + rand() * 2.4,
    });
  }
  return {
    palette: pick(PALETTES),
    intensity: 0.7 + rand() * 0.5,
    scale: 0.78 + rand() * 0.55,
    speed: 0.75 + rand() * 0.6,
    duration: 1900 + rand() * 700,
    spiralArms: 2 + Math.floor(rand() * 3),
    spiralTurns: 3.4 + rand() * 2.4,
    rotationDir: rand() < 0.5 ? 1 : -1,
    bursts,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const n = Number.parseInt(raw, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function perimeterPoint(
  panel: DOMRect,
  t: number,
  outset: number,
): { x: number; y: number } {
  const x = panel.left - outset;
  const y = panel.top - outset;
  const w = panel.width + outset * 2;
  const h = panel.height + outset * 2;
  const p = 2 * (w + h);
  let d = (((t % 1) + 1) % 1) * p;
  if (d < w) return { x: x + d, y };
  d -= w;
  if (d < h) return { x: x + w, y: y + d };
  d -= h;
  if (d < w) return { x: x + w - d, y: y + h };
  d -= w;
  return { x, y: y + h - d };
}

function burstOrigin(panel: DOMRect, side: Side, along: number, pad: number) {
  const a = Math.min(1, Math.max(0, along));
  switch (side) {
    case 'top':
      return { x: panel.left + panel.width * a, y: panel.top - pad };
    case 'right':
      return { x: panel.right + pad, y: panel.top + panel.height * a };
    case 'bottom':
      return { x: panel.left + panel.width * a, y: panel.bottom + pad };
    default:
      return { x: panel.left - pad, y: panel.top + panel.height * a };
  }
}

function burstDirection(side: Side, power: number) {
  const spread = (rand() - 0.5) * 1.15;
  switch (side) {
    case 'top':
      return { vx: spread * power, vy: -power * (0.55 + rand() * 0.7) };
    case 'right':
      return { vx: power * (0.55 + rand() * 0.7), vy: spread * power };
    case 'bottom':
      return { vx: spread * power, vy: power * (0.55 + rand() * 0.7) };
    default:
      return { vx: -power * (0.55 + rand() * 0.7), vy: spread * power };
  }
}

function spawnBurst(
  particles: Particle[],
  origin: { x: number; y: number },
  side: Side,
  count: number,
  power: number,
  palette: string[],
  intensity: number,
) {
  for (let i = 0; i < count; i += 1) {
    const dir = burstDirection(side, power);
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: dir.vx,
      vy: dir.vy,
      life: 0,
      maxLife: 520 + rand() * 620,
      size: (1.2 + rand() * 2.6) * intensity,
      color: pick(palette),
      gravity: 0.018 + rand() * 0.028,
      drag: 0.982,
      spark: rand() < 0.32,
    });
  }
}

function clipOutsidePanel(
  ctx: CanvasRenderingContext2D,
  panel: DOMRect,
  width: number,
  height: number,
) {
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  const radius = 14;
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(panel.left, panel.top, panel.width, panel.height, radius);
  } else {
    ctx.rect(panel.left, panel.top, panel.width, panel.height);
  }
  ctx.clip('evenodd');
}

function drawOuterSpiral(
  ctx: CanvasRenderingContext2D,
  panel: DOMRect,
  elapsed: number,
  show: Show,
  fade: number,
) {
  const progress = Math.min(1, elapsed / (900 / show.speed));
  const maxOutset = (48 + Math.min(panel.width, panel.height) * 0.08) * show.scale;
  const rotation = elapsed * 0.00055 * show.speed * show.rotationDir;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let arm = 0; arm < show.spiralArms; arm += 1) {
    const armShift = arm / show.spiralArms;
    ctx.beginPath();
    const steps = Math.max(36, Math.floor(show.spiralTurns * 56 * progress));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const theta = t * show.spiralTurns;
      const outset = 6 + theta * (maxOutset / Math.max(show.spiralTurns, 0.01)) * progress;
      const point = perimeterPoint(panel, theta + armShift + rotation, outset);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    const color = show.palette[arm % show.palette.length]!;
    ctx.strokeStyle = hexToRgba(color, 0.55 * fade * show.intensity);
    ctx.lineWidth = (2.4 - arm * 0.28) * show.intensity;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * show.intensity;
    ctx.stroke();
  }

  ctx.restore();
}

export function GameWindowCelebration({
  playId,
  panelRef,
}: GameWindowCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (playId <= 0) return;

    playFocusTrainingBell();

    const canvas = canvasRef.current;
    const panel = panelRef.current;
    if (!canvas || !panel) return;
    if (prefersReducedMotion()) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const show = buildShow();
    const particles: Particle[] = [];
    const fired = new Set<number>();
    let raf = 0;
    let running = true;
    let lastNow = performance.now();
    const startedAt = lastNow;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(document.documentElement);
    window.addEventListener('resize', resize);

    const tick = (now: number) => {
      if (!running) return;
      const elapsed = now - startedAt;
      const dt = Math.min(32, now - lastNow);
      lastNow = now;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const panelRect = panel.getBoundingClientRect();

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      clipOutsidePanel(ctx, panelRect, width, height);

      const fade = elapsed > show.duration - FADE_MS
        ? Math.max(0, 1 - (elapsed - (show.duration - FADE_MS)) / FADE_MS)
        : Math.min(1, elapsed / 160);

      ctx.save();
      ctx.globalAlpha = 0.18 * fade * show.intensity;
      const halo = ctx.createRadialGradient(
        panelRect.left + panelRect.width / 2,
        panelRect.top + panelRect.height / 2,
        Math.min(panelRect.width, panelRect.height) * 0.35,
        panelRect.left + panelRect.width / 2,
        panelRect.top + panelRect.height / 2,
        Math.hypot(panelRect.width, panelRect.height) * 0.72 * show.scale,
      );
      halo.addColorStop(0, 'rgba(0, 0, 0, 0)');
      halo.addColorStop(0.55, hexToRgba(show.palette[0]!, 0.16));
      halo.addColorStop(1, 'rgba(10, 5, 16, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hexToRgba(show.palette[0]!, 0.38 * fade * show.intensity);
      ctx.lineWidth = 2;
      ctx.shadowColor = show.palette[1] ?? show.palette[0]!;
      ctx.shadowBlur = (10 + Math.sin(elapsed / 130) * 6) * show.intensity;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(
          panelRect.left - 3,
          panelRect.top - 3,
          panelRect.width + 6,
          panelRect.height + 6,
          16,
        );
      } else {
        ctx.rect(
          panelRect.left - 3,
          panelRect.top - 3,
          panelRect.width + 6,
          panelRect.height + 6,
        );
      }
      ctx.stroke();
      ctx.restore();

      drawOuterSpiral(ctx, panelRect, elapsed, show, fade);

      show.bursts.forEach((burst, index) => {
        if (elapsed >= burst.at && !fired.has(index)) {
          fired.add(index);
          const origin = burstOrigin(panelRect, burst.side, burst.along, 10);
          spawnBurst(
            particles,
            origin,
            burst.side,
            burst.count,
            burst.power * show.speed,
            show.palette,
            show.intensity,
          );
        }
      });

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const step = dt / 16;
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i]!;
        p.life += dt;
        p.vy += p.gravity * step;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.x += p.vx * step;
        p.y += p.vy * step;
        const lifeT = p.life / p.maxLife;
        if (lifeT >= 1) {
          particles.splice(i, 1);
          continue;
        }
        const alpha = (1 - lifeT) * fade;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y,
          p.size * (p.spark ? 0.7 : 1) * (1 - lifeT * 0.35),
          0,
          Math.PI * 2,
        );
        ctx.fill();
        if (!p.spark) {
          ctx.globalAlpha = alpha * 0.32;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.restore();

      if (elapsed < show.duration) {
        raf = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [panelRef, playId]);

  if (playId <= 0 || typeof document === 'undefined') return null;

  return createPortal(
    <div className="flash-word-celebration game-window-celebration" aria-hidden="true">
      <canvas ref={canvasRef} className="flash-word-celebration__canvas" />
    </div>,
    document.body,
  );
}

export const FocusTrainingCelebration = GameWindowCelebration;

export function useGameWindowCelebration() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [playId, setPlayId] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const timerRef = useRef<number | null>(null);

  const triggerSuccess = useCallback(() => {
    setPlayId((id) => id + 1);
    setCelebrating(true);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setCelebrating(false);
    }, GAME_WINDOW_CELEBRATION_MS);
  }, []);

  useEffect(() => () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  return { panelRef, playId, celebrating, triggerSuccess };
}
