import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import {
  CATEGORY_TUTORIAL_REQUEST_EVENT,
  CATEGORY_TUTORIAL_STEPS,
  canAutoStartCategoryTutorial,
  categoryTutorialHasPendingContent,
  firstVisibleCategoryTutorialIndex,
  isCategoryDetailPath,
  isCategoryTutorialBlockedBySite,
  isCategoryTutorialDone,
  markCategoryTutorialDone,
  markCategoryTutorialJoinSeen,
  nextVisibleCategoryTutorialIndex,
  setCategoryTutorialOpen,
  visibleCategoryTutorialSteps,
  type CategoryTutorialPlacement,
} from '../lib/categoryTutorial';
import {
  SITE_TUTORIAL_DONE_EVENT,
  SITE_TUTORIAL_REQUEST_EVENT,
  queryTutorialTarget,
} from '../lib/siteTutorial';
import { VIDEOS_TUTORIAL_REQUEST_EVENT } from '../lib/videosTutorial';

type AnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const HIGHLIGHT_PAD = 8;
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
  preferred: CategoryTutorialPlacement,
): CategoryTutorialPlacement {
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

function pickCategoryPath(joinedCategoryIds: string[], categoryIds: string[]): string | null {
  const joined = joinedCategoryIds.find((id) => categoryIds.includes(id));
  if (joined) return `/category/${joined}`;
  const first = categoryIds[0];
  return first ? `/category/${first}` : null;
}

export function CategoryTutorial() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state } = useAppStore();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);
  const hotspotRef = useRef<HTMLButtonElement>(null);
  const forcedRef = useRef(false);
  const navigatingRef = useRef(false);
  const isAdminRoute = pathname.startsWith('/admin');
  const isCategoryRoute = isCategoryDetailPath(pathname);

  const closeOverlay = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
    setRect(null);
    setMissingTarget(false);
  }, []);

  const finishTutorial = useCallback(
    (markDone: boolean) => {
      if (markDone) markCategoryTutorialDone();
      forcedRef.current = false;
      closeOverlay();
    },
    [closeOverlay],
  );

  const startTutorial = useCallback((force = false) => {
    if (isAdminRoute) return;
    if (!force && isCategoryTutorialBlockedBySite()) return;
    if (!force && isCategoryTutorialDone()) return;
    forcedRef.current = force;
    setStepIndex(0);
    setRect(null);
    setMissingTarget(false);
    setOpen(true);
  }, [isAdminRoute]);

  useEffect(() => {
    if (isCategoryRoute) navigatingRef.current = false;
  }, [isCategoryRoute]);

  useEffect(() => {
    if (!open || navigatingRef.current) return;
    if (!isCategoryRoute) closeOverlay();
  }, [open, isCategoryRoute, closeOverlay]);

  useEffect(() => {
    if (open || isAdminRoute || !isCategoryRoute) return;

    const tryStart = () => {
      if (open || !canAutoStartCategoryTutorial()) return;
      startTutorial(false);
    };

    const timer = window.setTimeout(tryStart, 520);
    const interval = window.setInterval(tryStart, 900);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [open, isAdminRoute, isCategoryRoute, pathname, startTutorial]);

  useEffect(() => {
    const onSiteDone = () => {
      window.setTimeout(() => {
        if (!isCategoryDetailPath(window.location.pathname)) return;
        if (!canAutoStartCategoryTutorial()) return;
        startTutorial(false);
      }, 280);
    };
    const onSiteRequest = () => {
      if (open) closeOverlay();
    };
    window.addEventListener(SITE_TUTORIAL_DONE_EVENT, onSiteDone);
    window.addEventListener(SITE_TUTORIAL_REQUEST_EVENT, onSiteRequest);
    window.addEventListener(VIDEOS_TUTORIAL_REQUEST_EVENT, onSiteRequest);
    return () => {
      window.removeEventListener(SITE_TUTORIAL_DONE_EVENT, onSiteDone);
      window.removeEventListener(SITE_TUTORIAL_REQUEST_EVENT, onSiteRequest);
      window.removeEventListener(VIDEOS_TUTORIAL_REQUEST_EVENT, onSiteRequest);
    };
  }, [open, startTutorial, closeOverlay]);

  useEffect(() => {
    const onRequest = () => {
      if (pathname.startsWith('/admin')) return;
      if (!isCategoryDetailPath(pathname)) {
        const path = pickCategoryPath(
          state.joinedCategoryIds,
          state.categories.map((category) => category.id),
        );
        if (path) {
          navigatingRef.current = true;
          navigate(path);
        }
      }
      startTutorial(true);
    };
    window.addEventListener(CATEGORY_TUTORIAL_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(CATEGORY_TUTORIAL_REQUEST_EVENT, onRequest);
    };
  }, [pathname, navigate, startTutorial, state.joinedCategoryIds, state.categories]);

  useEffect(() => {
    if (!open || isAdminRoute) {
      setCategoryTutorialOpen(false);
      return;
    }
    setCategoryTutorialOpen(true);
    document.body.classList.add('site-tutorial-active');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishTutorial(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      setCategoryTutorialOpen(false);
      document.body.classList.remove('site-tutorial-active');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isAdminRoute, finishTutorial]);

  useLayoutEffect(() => {
    if (!open || isAdminRoute || !isCategoryRoute) {
      setRect(null);
      setMissingTarget(false);
      return;
    }

    const step = CATEGORY_TUTORIAL_STEPS[stepIndex];
    if (!step) {
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

    const skipMissing = () => {
      if (cancelled || found) return;
      const first = firstVisibleCategoryTutorialIndex();
      if (first >= 0 && first !== stepIndex && stepIndex === 0) {
        setStepIndex(first);
        return;
      }
      const next = nextVisibleCategoryTutorialIndex(stepIndex);
      if (next >= 0) {
        setStepIndex(next);
        return;
      }
      if (categoryTutorialHasPendingContent()) {
        markCategoryTutorialJoinSeen();
        finishTutorial(false);
        return;
      }
      setMissingTarget(true);
    };

    const tryFind = () => {
      if (cancelled || found) return;
      const el = queryTutorialTarget(step.target);
      if (!el) return;
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
    };

    tryFind();
    intervalId = window.setInterval(tryFind, 80);
    missTimer = window.setTimeout(skipMissing, MISSING_GRACE_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(missTimer);
      stopListen?.();
    };
  }, [open, isAdminRoute, isCategoryRoute, stepIndex, finishTutorial]);

  useEffect(() => {
    if (!open || isAdminRoute) return;
    hotspotRef.current?.focus();
  }, [open, isAdminRoute, stepIndex]);

  if (isAdminRoute || !open) return null;

  const step = CATEGORY_TUTORIAL_STEPS[stepIndex];
  if (!step) return null;

  const visible = visibleCategoryTutorialSteps();
  const visibleIndex = visible.findIndex((item) => item.id === step.id);
  const visibleCount = Math.max(visible.length, 1);
  const isLast =
    nextVisibleCategoryTutorialIndex(stepIndex) < 0 && !categoryTutorialHasPendingContent();
  const stepLabel = `Step ${visibleIndex >= 0 ? visibleIndex + 1 : 1} of ${visibleCount}`;
  const showFallback = missingTarget && !rect;

  const handleNext = () => {
    const next = nextVisibleCategoryTutorialIndex(stepIndex);
    if (next >= 0) {
      setRect(null);
      setMissingTarget(false);
      setStepIndex(next);
      return;
    }
    if (!forcedRef.current && categoryTutorialHasPendingContent()) {
      markCategoryTutorialJoinSeen();
      finishTutorial(false);
      return;
    }
    finishTutorial(true);
  };

  const highlight = rect
    ? {
        top: Math.max(0, rect.top - HIGHLIGHT_PAD),
        left: Math.max(0, rect.left - HIGHLIGHT_PAD),
        width: rect.width + HIGHLIGHT_PAD * 2,
        height: rect.height + HIGHLIGHT_PAD * 2,
      }
    : null;

  const hotspotX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const hotspotY = rect ? rect.top + rect.height / 2 : window.innerHeight * 0.42;

  const placement = rect ? pickPlacement(rect, step.placement) : 'bottom';
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
      aria-labelledby="category-tutorial-title"
      aria-describedby="category-tutorial-body"
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
        onClick={() => finishTutorial(true)}
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
        <h2 id="category-tutorial-title" className="site-tutorial__title">
          {step.title}
        </h2>
        <p id="category-tutorial-body" className="site-tutorial__body">
          {step.body}
        </p>
        <p className="site-tutorial__hint muted">
          {isLast ? 'Tap the circle to finish.' : 'Tap the circle to continue.'}
        </p>
      </div>
    </div>
  );
}
