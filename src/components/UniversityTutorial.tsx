import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CategoryTaskPathCard } from './CategoryTaskPathCard';
import { useAppStore } from '../hooks/useAppStore';
import { categoryDisplayIcon } from '../lib/categoryIcon';
import {
  SITE_TUTORIAL_DONE_EVENT,
  SITE_TUTORIAL_REQUEST_EVENT,
  queryTutorialTarget,
} from '../lib/siteTutorial';
import {
  canAutoStartUniversityTutorial,
  isUniversityPath,
  isUniversityTutorialBlocked,
  isUniversityTutorialDone,
  markUniversityTutorialDone,
  setUniversityTutorialOpen,
  UNIVERSITY_TUTORIAL_REQUEST_EVENT,
} from '../lib/universityTutorial';
import { categoriesInFamily } from '../lib/universityFamilies';
import type { Category, Task, UniversityFamily } from '../types';

type TutorialStep = 'theme' | 'tasks' | 'punishments' | 'pledge';

const PLEDGE_TASK: Task = {
  id: '__university-tutorial-pledge__',
  title: 'Enrollment pledge',
  description:
    'Sign below to confirm you understand University: pick a theme, complete its tasks, and use Punishments if you collect malus.',
  taskScope: 'category',
  xpReward: 10,
  pointsReward: 0,
  frequency: 'once',
  malusPointsOnFail: 0,
};

const HIGHLIGHT_PAD = 8;
const HOTSPOT_SIZE = 28;
const MISSING_GRACE_MS = 900;

const SPOTLIGHT_COPY: Record<
  'tasks' | 'punishments',
  { title: string; body: string; targets: string[]; placement: 'top' | 'bottom' }
> = {
  tasks: {
    title: 'Tasks are your modules',
    body: 'A theme is a degree. Each level is a module with its own task path. Complete them in order — exams unlock after the regular work.',
    targets: ['university-modules', 'university-themes'],
    placement: 'bottom',
  },
  punishments: {
    title: 'Punishments clear malus',
    body: 'Miss or fail a task and you collect malus. Tap Punishments here, pick a session, and finish it to burn that debt.',
    targets: ['university-punishments-tab'],
    placement: 'top',
  },
};

type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function wrapIndex(value: number, count: number): number {
  if (count <= 0) return 0;
  return ((Math.round(value) % count) + count) % count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readAnchorRect(targets: string[]): AnchorRect | null {
  for (const target of targets) {
    const el = queryTutorialTarget(target);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) continue;
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  }
  return null;
}

function pickPlacement(
  rect: AnchorRect,
  preferred: 'top' | 'bottom',
): 'top' | 'bottom' {
  const hotspotY = rect.top + rect.height / 2;
  const tooltipH = 150;
  if (preferred === 'top' && hotspotY - HOTSPOT_SIZE / 2 - 12 - tooltipH < 8) {
    return 'bottom';
  }
  if (
    preferred === 'bottom' &&
    hotspotY + HOTSPOT_SIZE / 2 + 12 + tooltipH > window.innerHeight - 8
  ) {
    return 'top';
  }
  return preferred;
}

function themeCover(
  family: UniversityFamily,
  categories: Category[],
): Category {
  const members = categoriesInFamily(categories, family.id);
  const cover = members.find((category) => category.imageUrl);
  return {
    id: family.id,
    name: family.name,
    icon: categoryDisplayIcon(family.name, family.icon || cover?.icon),
    color: family.color,
    description: family.description,
    imageUrl: cover?.imageUrl,
  };
}

function ThemeCarousel({
  themes,
  categories,
  onIndexChange,
  onConfirm,
}: {
  themes: UniversityFamily[];
  categories: Category[];
  onIndexChange: (index: number) => void;
  onConfirm: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(0);
  const velocityRef = useRef(0);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastTRef = useRef(0);
  const indexRef = useRef(0);
  const [position, setPosition] = useState(0);
  const count = themes.length;

  const emitIndex = useCallback(
    (next: number) => {
      const wrapped = wrapIndex(next, count);
      if (indexRef.current === wrapped) return;
      indexRef.current = wrapped;
      onIndexChange(wrapped);
    },
    [count, onIndexChange],
  );

  useEffect(() => {
    if (count === 0) return;
    let frame = 0;
    const tick = () => {
      let next = positionRef.current;
      if (!draggingRef.current) {
        velocityRef.current *= 0.92;
        next += velocityRef.current;
        if (Math.abs(velocityRef.current) < 0.0035) {
          velocityRef.current = 0;
          const target = Math.round(next);
          next += (target - next) * 0.22;
          if (Math.abs(target - next) < 0.002) next = target;
        }
      }
      positionRef.current = next;
      setPosition(next);
      emitIndex(next);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [count, emitIndex]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node || count === 0) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      velocityRef.current += delta * 0.0018;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [count]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (count === 0) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        velocityRef.current = 0;
        positionRef.current = Math.round(positionRef.current) + 1;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        velocityRef.current = 0;
        positionRef.current = Math.round(positionRef.current) - 1;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (count === 0) return;
    draggingRef.current = true;
    velocityRef.current = 0;
    lastXRef.current = event.clientX;
    lastTRef.current = event.timeStamp;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || count === 0) return;
    const dx = event.clientX - lastXRef.current;
    const dt = Math.max(16, event.timeStamp - lastTRef.current);
    const step = Math.max(160, event.currentTarget.clientWidth * 0.28);
    positionRef.current -= dx / step;
    velocityRef.current = (-dx / step) * (16 / dt);
    lastXRef.current = event.clientX;
    lastTRef.current = event.timeStamp;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const nudge = (dir: number) => {
    velocityRef.current = 0;
    positionRef.current = Math.round(positionRef.current) + dir;
  };

  const active = wrapIndex(position, count);

  if (count === 0) {
    return (
      <p className="muted university-tutorial__empty">
        No themes yet. You can still continue the guide.
      </p>
    );
  }

  const slots = count === 1 ? [0] : [-2, -1, 0, 1, 2];
  const base = Math.round(position);

  return (
    <div className="university-carousel">
      <button
        type="button"
        className="university-carousel__nav"
        aria-label="Previous theme"
        onClick={() => nudge(-1)}
      >
        ‹
      </button>
      <div
        ref={stageRef}
        className="university-carousel__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="listbox"
        aria-label="Starting theme"
        aria-activedescendant={themes[active]?.id}
      >
        {slots.map((slot) => {
          const logical = base + slot;
          const theme = themes[wrapIndex(logical, count)];
          const x = logical - position;
          const depth = Math.abs(x);
          const scale = Math.max(0.62, 1 - depth * 0.2);
          const cover = themeCover(theme, categories);
          const selected = wrapIndex(logical, count) === active && depth < 0.5;
          return (
            <article
              key={`${theme.id}-${slot}`}
              id={selected ? theme.id : undefined}
              className={
                selected
                  ? 'university-carousel__card is-active'
                  : 'university-carousel__card'
              }
              role="option"
              aria-selected={selected}
              style={{
                transform: `translate(-50%, -50%) translateX(${x * 11.4}rem) rotateY(${x * -32}deg) scale(${scale})`,
                zIndex: 20 - Math.round(depth * 4),
                opacity: Math.max(0.18, 1 - depth * 0.38),
                ['--theme-color' as string]: theme.color,
              }}
              onClick={() => {
                if (!selected || Math.abs(velocityRef.current) > 0.04) return;
                onConfirm();
              }}
            >
              <div className="university-carousel__media">
                {cover.imageUrl ? (
                  <img src={cover.imageUrl} alt="" />
                ) : (
                  <span aria-hidden>{cover.icon}</span>
                )}
              </div>
              <div className="university-carousel__copy">
                <p className="university-carousel__kicker">Theme</p>
                <h3>{theme.name}</h3>
                {theme.description ? <p>{theme.description}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
      <button
        type="button"
        className="university-carousel__nav"
        aria-label="Next theme"
        onClick={() => nudge(1)}
      >
        ›
      </button>
      <div className="university-carousel__dots" role="tablist" aria-label="Themes">
        {themes.map((theme, index) => (
          <button
            key={theme.id}
            type="button"
            role="tab"
            aria-selected={index === active}
            className={
              index === active
                ? 'university-carousel__dot is-active'
                : 'university-carousel__dot'
            }
            onClick={() => {
              velocityRef.current = 0;
              const current = wrapIndex(positionRef.current, count);
              let delta = index - current;
              if (delta > count / 2) delta -= count;
              if (delta < -count / 2) delta += count;
              positionRef.current = Math.round(positionRef.current) + delta;
            }}
            aria-label={theme.name}
          />
        ))}
      </div>
    </div>
  );
}

function SignaturePad({
  onSignedChange,
}: {
  onSignedChange: (signed: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f5d0fe';
    ctx.lineWidth = 2.4;
  }, []);

  useEffect(() => {
    sizeCanvas();
  }, [sizeCanvas]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    lastRef.current = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = event.currentTarget.getContext('2d');
    const last = lastRef.current;
    const next = pointFromEvent(event);
    if (!ctx || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastRef.current = next;
    if (!inked) {
      setInked(true);
      onSignedChange(true);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const clear = () => {
    sizeCanvas();
    setInked(false);
    onSignedChange(false);
  };

  return (
    <div className="university-tutorial__sign">
      <canvas
        ref={canvasRef}
        className="university-tutorial__canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Signature"
      />
      {inked ? null : (
        <p className="university-tutorial__sign-hint">Sign here</p>
      )}
      {inked ? (
        <button type="button" className="btn btn--ghost btn--small" onClick={clear}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

function StepCopy({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="university-tutorial__copy">
      <p className="university-tutorial__kicker">{kicker}</p>
      <h2 id="university-tutorial-title" className="university-tutorial__title">
        {title}
      </h2>
      <div id="university-tutorial-body" className="university-tutorial__body">
        {children}
      </div>
    </div>
  );
}

export function UniversityTutorial() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state, isEffectiveAdmin } = useAppStore();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<TutorialStep>('theme');
  const [themeIndex, setThemeIndex] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);
  const hotspotRef = useRef<HTMLButtonElement>(null);
  const forcedRef = useRef(false);
  const navigatingRef = useRef(false);
  const isAdminRoute = pathname.startsWith('/admin');
  const onUniversity = isUniversityPath(pathname);
  const spotlight = step === 'tasks' || step === 'punishments';

  const themes = useMemo(
    () =>
      [...state.universityFamilies].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [state.universityFamilies],
  );
  const selectedTheme = themes[themeIndex] ?? themes[0] ?? null;
  const signed = drawn || typedName.trim().length >= 2;

  const goToTasks = useCallback(() => {
    setRect(null);
    setMissingTarget(false);
    setStep('tasks');
    const dest = selectedTheme
      ? `/university/theme/${selectedTheme.id}`
      : '/university';
    if (pathname !== dest) {
      navigatingRef.current = true;
      navigate(dest);
    }
  }, [navigate, pathname, selectedTheme]);

  const closeOverlay = useCallback(() => {
    setOpen(false);
    setStep('theme');
    setDrawn(false);
    setTypedName('');
  }, []);

  const finishTutorial = useCallback(
    (markDone: boolean, familyId?: string | null) => {
      if (markDone) markUniversityTutorialDone();
      forcedRef.current = false;
      closeOverlay();
      if (familyId) {
        navigatingRef.current = true;
        navigate(`/university/theme/${familyId}`);
      }
    },
    [closeOverlay, navigate],
  );

  const startTutorial = useCallback(
    (force = false) => {
      if (isAdminRoute) return;
      if (!force && isUniversityTutorialBlocked()) return;
      if (!force && isUniversityTutorialDone()) return;
      forcedRef.current = force;
      setThemeIndex(0);
      setStep('theme');
      setDrawn(false);
      setTypedName('');
      setOpen(true);
    },
    [isAdminRoute],
  );

  useEffect(() => {
    if (onUniversity) navigatingRef.current = false;
  }, [onUniversity]);

  useEffect(() => {
    if (!open || navigatingRef.current) return;
    if (!onUniversity) closeOverlay();
  }, [open, onUniversity, closeOverlay]);

  useEffect(() => {
    if (open || isAdminRoute || !onUniversity) return;
    const tryStart = () => {
      if (!canAutoStartUniversityTutorial()) return;
      startTutorial(false);
    };
    const timer = window.setTimeout(tryStart, 420);
    return () => window.clearTimeout(timer);
  }, [open, isAdminRoute, onUniversity, startTutorial]);

  useEffect(() => {
    const onSiteDone = () => {
      window.setTimeout(() => {
        if (!isUniversityPath(window.location.pathname)) return;
        if (!canAutoStartUniversityTutorial()) return;
        startTutorial(false);
      }, 280);
    };
    const onSiteRequest = () => {
      if (open) closeOverlay();
    };
    window.addEventListener(SITE_TUTORIAL_DONE_EVENT, onSiteDone);
    window.addEventListener(SITE_TUTORIAL_REQUEST_EVENT, onSiteRequest);
    return () => {
      window.removeEventListener(SITE_TUTORIAL_DONE_EVENT, onSiteDone);
      window.removeEventListener(SITE_TUTORIAL_REQUEST_EVENT, onSiteRequest);
    };
  }, [open, closeOverlay, startTutorial]);

  useEffect(() => {
    const onRequest = () => {
      if (pathname.startsWith('/admin')) return;
      if (!isUniversityPath(pathname)) {
        navigatingRef.current = true;
        navigate('/university');
      }
      startTutorial(true);
    };
    window.addEventListener(UNIVERSITY_TUTORIAL_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(UNIVERSITY_TUTORIAL_REQUEST_EVENT, onRequest);
    };
  }, [pathname, navigate, startTutorial]);

  useEffect(() => {
    if (!open || isAdminRoute) {
      setUniversityTutorialOpen(false);
      return;
    }
    setUniversityTutorialOpen(true);
    document.body.classList.add('site-tutorial-active');
    const lockScroll = step === 'theme' || step === 'pledge';
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    return () => {
      setUniversityTutorialOpen(false);
      document.body.classList.remove('site-tutorial-active');
      document.body.style.overflow = previousOverflow;
    };
  }, [open, isAdminRoute, step]);

  useEffect(() => {
    if (!open || step !== 'tasks' || !selectedTheme) return;
    const dest = `/university/theme/${selectedTheme.id}`;
    if (pathname !== dest) {
      navigatingRef.current = true;
      navigate(dest);
    }
  }, [open, step, selectedTheme, pathname, navigate]);

  useLayoutEffect(() => {
    if (!open || isAdminRoute || !spotlight) {
      setRect(null);
      setMissingTarget(false);
      return;
    }
    if (step !== 'tasks' && step !== 'punishments') return;
    const copy = SPOTLIGHT_COPY[step];
    let cancelled = false;
    let found = false;
    let intervalId = 0;
    let missTimer = 0;
    let stopListen: (() => void) | undefined;
    const update = () => {
      if (cancelled) return;
      const next = readAnchorRect(copy.targets);
      if (!next) return;
      setRect(next);
      setMissingTarget(false);
    };
    const attach = (el: HTMLElement) => {
      const onScrollOrResize = () => update();
      window.addEventListener('resize', onScrollOrResize);
      window.addEventListener('scroll', onScrollOrResize, true);
      const ro = new ResizeObserver(onScrollOrResize);
      ro.observe(el);
      stopListen = () => {
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize, true);
        ro.disconnect();
      };
    };
    const tryFind = () => {
      if (cancelled || found) return;
      for (const target of copy.targets) {
        const el = queryTutorialTarget(target);
        if (!el) continue;
        found = true;
        window.clearInterval(intervalId);
        window.clearTimeout(missTimer);
        el.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
        attach(el);
        requestAnimationFrame(update);
        return;
      }
    };
    tryFind();
    intervalId = window.setInterval(tryFind, 80);
    missTimer = window.setTimeout(() => {
      if (!cancelled && !found) setMissingTarget(true);
    }, MISSING_GRACE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(missTimer);
      stopListen?.();
    };
  }, [open, isAdminRoute, spotlight, step, pathname]);

  useEffect(() => {
    if (!open || !spotlight) return;
    hotspotRef.current?.focus();
  }, [open, spotlight, step]);

  if (!open || isAdminRoute) return null;

  const skipButton = isEffectiveAdmin ? (
    <button
      type="button"
      className="site-tutorial__skip"
      onClick={() => finishTutorial(true)}
    >
      Skip
    </button>
  ) : null;

  const pledgeCategory: Category = selectedTheme
    ? themeCover(selectedTheme, state.categories)
    : {
        id: 'university',
        name: 'University',
        icon: '🎓',
        color: '#c084fc',
        description: '',
      };

  if (spotlight && (step === 'tasks' || step === 'punishments')) {
    const copy = SPOTLIGHT_COPY[step];
    const isLastSpotlight = step === 'punishments';
    const handleNext = () => {
      setRect(null);
      setMissingTarget(false);
      setStep(isLastSpotlight ? 'pledge' : 'punishments');
    };
    const showFallback = missingTarget && !rect;
    const highlight = rect
      ? {
          top: Math.max(0, rect.top - HIGHLIGHT_PAD),
          left: Math.max(0, rect.left - HIGHLIGHT_PAD),
          width: rect.width + HIGHLIGHT_PAD * 2,
          height: rect.height + HIGHLIGHT_PAD * 2,
        }
      : null;
    const hotspotX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const hotspotY = rect
      ? rect.top + rect.height / 2
      : window.innerHeight * 0.42;
    const placement = rect ? pickPlacement(rect, copy.placement) : copy.placement;
    const tooltipWidth = Math.min(20 * 16, window.innerWidth - 24);
    const tooltipLeft = clamp(
      hotspotX - tooltipWidth / 2,
      12,
      window.innerWidth - tooltipWidth - 12,
    );
    const tooltipTop =
      placement === 'bottom' ? hotspotY + HOTSPOT_SIZE / 2 + 14 : undefined;
    const tooltipBottom =
      placement === 'top'
        ? window.innerHeight - (hotspotY - HOTSPOT_SIZE / 2 - 14)
        : undefined;
    const arrowLeft = clamp(hotspotX - tooltipLeft, 18, tooltipWidth - 18);

    return (
      <div
        className="site-tutorial"
        role="dialog"
        aria-modal="false"
        aria-labelledby="university-tutorial-title"
        aria-describedby="university-tutorial-body"
      >
        <div className="site-tutorial__scrim" aria-hidden="true" />
        {highlight ? (
          <button
            type="button"
            className="site-tutorial__highlight site-tutorial__highlight--hit"
            style={highlight}
            aria-label="Continue"
            onClick={handleNext}
          />
        ) : null}
        {skipButton}
        <button
          ref={hotspotRef}
          type="button"
          className={
            showFallback
              ? 'site-tutorial__hotspot site-tutorial__hotspot--fallback'
              : 'site-tutorial__hotspot'
          }
          style={{ top: hotspotY, left: hotspotX }}
          aria-label="Next step"
          onClick={handleNext}
        />
        <div
          className={`site-tutorial__tooltip site-tutorial__tooltip--${placement}`}
          style={
            {
              width: tooltipWidth,
              left: tooltipLeft,
              top: tooltipTop,
              bottom: tooltipBottom,
              '--arrow-left': `${arrowLeft}px`,
            } as CSSProperties
          }
        >
          <p className="site-tutorial__kicker">
            {step === 'tasks' ? 'Step 2 of 4' : 'Step 3 of 4'}
          </p>
          <h2 id="university-tutorial-title" className="site-tutorial__title">
            {copy.title}
          </h2>
          <p id="university-tutorial-body" className="site-tutorial__body">
            {copy.body}
          </p>
          <p className="site-tutorial__hint muted">
            Tap the circle — or the highlighted area — to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="university-tutorial"
      role="dialog"
      aria-modal="true"
      aria-labelledby="university-tutorial-title"
      aria-describedby="university-tutorial-body"
    >
      <div className="university-tutorial__scrim" aria-hidden />
      {skipButton}
      <div
        className="university-tutorial__panel"
        data-tutorial={step === 'pledge' ? 'university-pledge' : undefined}
      >
        <p className="university-tutorial__progress">
          {step === 'theme' ? '1 / 4' : '4 / 4'}
        </p>

        {step === 'theme' ? (
          <>
            <StepCopy kicker="University" title="Pick a starting theme">
              <p>
                Spin the wheel to browse themes. Drag, scroll, or use the arrows.
                Tap the theme in the center to continue.
              </p>
            </StepCopy>
            <ThemeCarousel
              themes={themes}
              categories={state.categories}
              onIndexChange={setThemeIndex}
              onConfirm={goToTasks}
            />
            <div className="university-tutorial__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={goToTasks}
              >
                {selectedTheme
                  ? `Continue with ${selectedTheme.name}`
                  : 'Continue'}
              </button>
            </div>
            <p className="muted university-tutorial__hint">
              Drag · mouse wheel · arrows · tap the card
            </p>
          </>
        ) : null}

        {step === 'pledge' ? (
          <>
            <StepCopy kicker="Enrollment" title="Sign, then START">
              <p>
                This is what a University task looks like. Sign the pledge — draw
                or type your name — then press START to enter your theme.
              </p>
            </StepCopy>
            <CategoryTaskPathCard
              task={PLEDGE_TASK}
              category={pledgeCategory}
              stepNumber={1}
              status="not_started"
            />
            <SignaturePad onSignedChange={setDrawn} />
            <label className="field university-tutorial__name">
              <span>Or type your name</span>
              <input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <div className="university-tutorial__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={!signed}
                onClick={() => finishTutorial(true, selectedTheme?.id ?? null)}
              >
                START
              </button>
            </div>
            <p className="muted university-tutorial__hint">
              Signature required to start
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
