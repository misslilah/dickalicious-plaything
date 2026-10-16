import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  SITE_TUTORIAL_REQUEST_EVENT,
  SITE_TUTORIAL_STEPS,
  isSiteTutorialDone,
  markSiteTutorialDone,
  queryTutorialTarget,
  setSiteTutorialOpen,
  type SiteTutorialPlacement,
} from '../lib/siteTutorial';

type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const HIGHLIGHT_PAD = 8;
const NAV_HIGHLIGHT_PAD = 5;
const HOTSPOT_SIZE = 28;
const MISSING_GRACE_MS = 900;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readAnchorRect(target: string): AnchorRect | null {
  const el = queryTutorialTarget(target);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 && rect.height < 2) return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function pickPlacement(
  rect: AnchorRect,
  preferred: SiteTutorialPlacement,
): SiteTutorialPlacement {
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

export function SiteTutorial() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);
  const hotspotRef = useRef<HTMLButtonElement>(null);
  const isAdminRoute = pathname.startsWith('/admin');

  const closeTutorial = useCallback(
    (goHome = false) => {
      markSiteTutorialDone();
      setOpen(false);
      setStepIndex(0);
      setRect(null);
      setMissingTarget(false);
      if (goHome && pathname !== '/') {
        navigate('/');
      }
    },
    [navigate, pathname],
  );

  const startTutorial = useCallback(() => {
    setStepIndex(0);
    setRect(null);
    setMissingTarget(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (isAdminRoute) return;
    if (!isSiteTutorialDone()) {
      const timer = window.setTimeout(() => setOpen(true), 420);
      return () => window.clearTimeout(timer);
    }
  }, [isAdminRoute]);

  useEffect(() => {
    const onRequest = () => {
      if (pathname.startsWith('/admin')) return;
      startTutorial();
    };
    window.addEventListener(SITE_TUTORIAL_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(SITE_TUTORIAL_REQUEST_EVENT, onRequest);
    };
  }, [pathname, startTutorial]);

  useEffect(() => {
    if (!open || isAdminRoute) return;
    const step = SITE_TUTORIAL_STEPS[stepIndex];
    if (step && pathname !== step.route) {
      navigate(step.route);
    }
  }, [open, isAdminRoute, stepIndex, pathname, navigate]);

  useEffect(() => {
    if (!open || isAdminRoute) {
      setSiteTutorialOpen(false);
      return;
    }
    setSiteTutorialOpen(true);
    document.body.classList.add('site-tutorial-active');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTutorial();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      setSiteTutorialOpen(false);
      document.body.classList.remove('site-tutorial-active');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isAdminRoute, closeTutorial]);

  useLayoutEffect(() => {
    if (!open || isAdminRoute) {
      setRect(null);
      setMissingTarget(false);
      return;
    }

    const step = SITE_TUTORIAL_STEPS[stepIndex];
    if (!step || pathname !== step.route) {
      setRect(null);
      setMissingTarget(false);
      return;
    }

    let cancelled = false;
    let found = false;
    let intervalId = 0;
    let missTimer = 0;
    let stopListen: (() => void) | undefined;

    const update = () => {
      if (cancelled) return;
      const next = readAnchorRect(step.target);
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
      const main = document.querySelector('.app-main');
      if (main) ro.observe(main);
      stopListen = () => {
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize, true);
        ro.disconnect();
      };
    };

    const tryFind = () => {
      if (cancelled || found) return;
      const el = queryTutorialTarget(step.target);
      if (!el) return;
      found = true;
      window.clearInterval(intervalId);
      window.clearTimeout(missTimer);
      el.scrollIntoView({
        block: step.target.startsWith('nav-') ? 'nearest' : 'center',
        inline: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      attach(el);
      requestAnimationFrame(update);
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
  }, [open, isAdminRoute, stepIndex, pathname]);

  useEffect(() => {
    if (!open || isAdminRoute) return;
    hotspotRef.current?.focus();
  }, [open, isAdminRoute, stepIndex]);

  if (isAdminRoute || !open) return null;

  const step = SITE_TUTORIAL_STEPS[stepIndex];
  if (!step) return null;

  const isLast = stepIndex >= SITE_TUTORIAL_STEPS.length - 1;
  const stepLabel = `Step ${stepIndex + 1} of ${SITE_TUTORIAL_STEPS.length}`;
  const showFallback = missingTarget && !rect;

  const handleNext = () => {
    if (isLast) {
      closeTutorial(true);
      return;
    }
    setRect(null);
    setMissingTarget(false);
    setStepIndex((current) => current + 1);
  };

  const pad = step.target.startsWith('nav-') ? NAV_HIGHLIGHT_PAD : HIGHLIGHT_PAD;
  const highlight = rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const hotspotX = rect
    ? rect.left + rect.width / 2
    : window.innerWidth / 2;
  const hotspotY = rect
    ? rect.top + rect.height / 2
    : window.innerHeight * 0.42;

  const placement = rect ? pickPlacement(rect, step.placement) : 'bottom';
  const tooltipWidth = Math.min(20 * 16, window.innerWidth - 24);
  const tooltipLeft = clamp(
    hotspotX - tooltipWidth / 2,
    12,
    window.innerWidth - tooltipWidth - 12,
  );
  const tooltipTop =
    placement === 'bottom'
      ? hotspotY + HOTSPOT_SIZE / 2 + 14
      : undefined;
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
      aria-labelledby="site-tutorial-title"
      aria-describedby="site-tutorial-body"
    >
      <div className="site-tutorial__scrim" aria-hidden="true" />
      {highlight && (
        <div
          className="site-tutorial__highlight"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
          }}
        />
      )}
      <button
        type="button"
        className="site-tutorial__skip"
        onClick={() => closeTutorial()}
      >
        Skip
      </button>
      <button
        ref={hotspotRef}
        type="button"
        className={
          showFallback
            ? 'site-tutorial__hotspot site-tutorial__hotspot--fallback'
            : 'site-tutorial__hotspot'
        }
        style={{ top: hotspotY, left: hotspotX }}
        aria-label={isLast ? 'Finish tutorial' : 'Next step'}
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
        <p className="site-tutorial__kicker">{stepLabel}</p>
        <h2 id="site-tutorial-title" className="site-tutorial__title">
          {step.title}
        </h2>
        <p id="site-tutorial-body" className="site-tutorial__body">
          {step.body}
        </p>
        <p className="site-tutorial__hint muted">
          {isLast ? 'Tap the circle to finish.' : 'Tap the circle to continue.'}
        </p>
      </div>
    </div>
  );
}
