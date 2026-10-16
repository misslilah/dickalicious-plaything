import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import {
  CATEGORY_TUTORIAL_DONE_EVENT,
  CATEGORY_TUTORIAL_REQUEST_EVENT,
} from '../lib/categoryTutorial';
import {
  SITE_TUTORIAL_DONE_EVENT,
  SITE_TUTORIAL_REQUEST_EVENT,
  queryTutorialTarget,
} from '../lib/siteTutorial';
import {
  VIDEOS_TUTORIAL_REQUEST_EVENT,
  VIDEOS_TUTORIAL_STEPS,
  canAutoStartVideosTutorial,
  firstPlayableVideoCategoryPath,
  firstVisibleVideosTutorialIndex,
  isPlayableVideoCategoryPath,
  isVideosPath,
  isVideosTutorialBlocked,
  isVideosTutorialDone,
  markVideosTutorialDone,
  nextVisibleVideosTutorialIndex,
  requestVideosMediaTab,
  setVideosTutorialOpen,
  type VideosTutorialPlacement,
} from '../lib/videosTutorial';
import type { VideoAccessContext } from '../lib/videoAccess';

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
  preferred: VideosTutorialPlacement,
): VideosTutorialPlacement {
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

export function VideosTutorial() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state, effectiveSession, isEffectiveAdmin } = useAppStore();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);
  const hotspotRef = useRef<HTMLButtonElement>(null);
  const forcedRef = useRef(false);
  const navigatingRef = useRef(false);
  const isAdminRoute = pathname.startsWith('/admin');
  const onVideosRoute = isVideosPath(pathname);

  const videoAccessCtx: VideoAccessContext = useMemo(
    () => ({
      patreonTier: effectiveSession?.patreonTier,
      patreonStatus: effectiveSession?.patreonStatus,
      isAdmin: isEffectiveAdmin,
      purchasedVideoIds: state.purchasedVideoIds,
    }),
    [
      effectiveSession?.patreonTier,
      effectiveSession?.patreonStatus,
      isEffectiveAdmin,
      state.purchasedVideoIds,
    ],
  );

  const canPlay = Boolean(
    firstPlayableVideoCategoryPath(
      state.videoCategories,
      state.videos,
      videoAccessCtx,
    ),
  );

  const closeOverlay = useCallback(() => {
    setOpen(false);
    setStepIndex(0);
    setRect(null);
    setMissingTarget(false);
  }, []);

  const finishTutorial = useCallback(
    (markDone: boolean) => {
      if (markDone) markVideosTutorialDone();
      forcedRef.current = false;
      navigatingRef.current = false;
      closeOverlay();
    },
    [closeOverlay],
  );

  const startTutorial = useCallback(
    (force = false) => {
      if (isAdminRoute) return;
      if (!force && isVideosTutorialBlocked()) return;
      if (!force && isVideosTutorialDone()) return;
      forcedRef.current = force;
      setStepIndex(0);
      setRect(null);
      setMissingTarget(false);
      setOpen(true);
    },
    [isAdminRoute],
  );

  useEffect(() => {
    if (onVideosRoute) navigatingRef.current = false;
  }, [onVideosRoute]);

  useEffect(() => {
    if (!open || navigatingRef.current) return;
    if (!onVideosRoute) closeOverlay();
  }, [open, onVideosRoute, closeOverlay]);

  useEffect(() => {
    if (open || isAdminRoute || !onVideosRoute) return;

    const tryStart = () => {
      if (open || !canAutoStartVideosTutorial()) return;
      startTutorial(false);
    };

    const timer = window.setTimeout(tryStart, 520);
    const interval = window.setInterval(tryStart, 900);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [open, isAdminRoute, onVideosRoute, pathname, startTutorial]);

  useEffect(() => {
    const onSiteDone = () => {
      window.setTimeout(() => {
        if (!isVideosPath(window.location.pathname)) return;
        if (!canAutoStartVideosTutorial()) return;
        startTutorial(false);
      }, 280);
    };
    const onSiteOrCategoryRequest = () => {
      if (open) closeOverlay();
    };
    const onCategoryDone = () => {
      window.setTimeout(() => {
        if (!isVideosPath(window.location.pathname)) return;
        if (!canAutoStartVideosTutorial()) return;
        startTutorial(false);
      }, 280);
    };
    window.addEventListener(SITE_TUTORIAL_DONE_EVENT, onSiteDone);
    window.addEventListener(SITE_TUTORIAL_REQUEST_EVENT, onSiteOrCategoryRequest);
    window.addEventListener(CATEGORY_TUTORIAL_DONE_EVENT, onCategoryDone);
    window.addEventListener(
      CATEGORY_TUTORIAL_REQUEST_EVENT,
      onSiteOrCategoryRequest,
    );
    return () => {
      window.removeEventListener(SITE_TUTORIAL_DONE_EVENT, onSiteDone);
      window.removeEventListener(
        SITE_TUTORIAL_REQUEST_EVENT,
        onSiteOrCategoryRequest,
      );
      window.removeEventListener(CATEGORY_TUTORIAL_DONE_EVENT, onCategoryDone);
      window.removeEventListener(
        CATEGORY_TUTORIAL_REQUEST_EVENT,
        onSiteOrCategoryRequest,
      );
    };
  }, [open, startTutorial, closeOverlay]);

  useEffect(() => {
    const onRequest = () => {
      if (pathname.startsWith('/admin')) return;
      if (!isVideosPath(pathname)) {
        navigatingRef.current = true;
        navigate('/videos');
      }
      startTutorial(true);
    };
    window.addEventListener(VIDEOS_TUTORIAL_REQUEST_EVENT, onRequest);
    return () => {
      window.removeEventListener(VIDEOS_TUTORIAL_REQUEST_EVENT, onRequest);
    };
  }, [pathname, navigate, startTutorial]);

  useEffect(() => {
    if (!open || isAdminRoute) {
      setVideosTutorialOpen(false);
      return;
    }
    setVideosTutorialOpen(true);
    document.body.classList.add('site-tutorial-active');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishTutorial(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      setVideosTutorialOpen(false);
      document.body.classList.remove('site-tutorial-active');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, isAdminRoute, finishTutorial]);

  useEffect(() => {
    if (!open || isAdminRoute) return;
    const step = VIDEOS_TUTORIAL_STEPS[stepIndex];
    if (!step) return;

    if (step.mediaTab) {
      requestVideosMediaTab(step.mediaTab);
    }

    if (step.route === 'catalog') {
      if (pathname !== '/videos') {
        navigatingRef.current = true;
        navigate('/videos');
      }
      return;
    }

    if (
      isPlayableVideoCategoryPath(
        pathname,
        state.videoCategories,
        state.videos,
        videoAccessCtx,
      )
    ) {
      return;
    }

    const playPath = firstPlayableVideoCategoryPath(
      state.videoCategories,
      state.videos,
      videoAccessCtx,
    );
    if (playPath && pathname !== playPath) {
      navigatingRef.current = true;
      navigate(playPath);
    }
  }, [
    open,
    isAdminRoute,
    stepIndex,
    pathname,
    navigate,
    state.videoCategories,
    state.videos,
    videoAccessCtx,
  ]);

  useLayoutEffect(() => {
    if (!open || isAdminRoute || !onVideosRoute) {
      setRect(null);
      setMissingTarget(false);
      return;
    }

    const step = VIDEOS_TUTORIAL_STEPS[stepIndex];
    if (!step) {
      setRect(null);
      setMissingTarget(false);
      return;
    }

    const onCatalogStep = step.route === 'catalog';
    if (onCatalogStep && pathname !== '/videos') {
      setRect(null);
      setMissingTarget(false);
      return;
    }
    if (
      step.route === 'play' &&
      !isPlayableVideoCategoryPath(
        pathname,
        state.videoCategories,
        state.videos,
        videoAccessCtx,
      )
    ) {
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
      const first = firstVisibleVideosTutorialIndex(canPlay);
      if (first >= 0 && first !== stepIndex && stepIndex === 0) {
        setStepIndex(first);
        return;
      }
      const next = nextVisibleVideosTutorialIndex(stepIndex, canPlay);
      if (next >= 0) {
        setStepIndex(next);
        return;
      }
      finishTutorial(true);
    };

    const tryFind = () => {
      if (cancelled || found) return;
      const el = queryTutorialTarget(step.target);
      if (!el) return;
      found = true;
      window.clearInterval(intervalId);
      window.clearTimeout(missTimer);
      el.scrollIntoView({
        block:
          step.target.startsWith('nav-') || step.target.endsWith('-tab')
            ? 'nearest'
            : 'center',
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
  }, [
    open,
    isAdminRoute,
    onVideosRoute,
    stepIndex,
    pathname,
    finishTutorial,
    canPlay,
    state.videoCategories,
    state.videos,
    videoAccessCtx,
  ]);

  useEffect(() => {
    if (!open || isAdminRoute) return;
    hotspotRef.current?.focus();
  }, [open, isAdminRoute, stepIndex]);

  if (isAdminRoute || !open) return null;

  const step = VIDEOS_TUTORIAL_STEPS[stepIndex];
  if (!step) return null;

  const visible = VIDEOS_TUTORIAL_STEPS.filter((item) =>
    item.route === 'play' ? canPlay : true,
  );
  const visibleIndex = visible.findIndex((item) => item.id === step.id);
  const visibleCount = Math.max(visible.length, 1);
  const isLast = nextVisibleVideosTutorialIndex(stepIndex, canPlay) < 0;
  const stepLabel = `Step ${visibleIndex >= 0 ? visibleIndex + 1 : 1} of ${visibleCount}`;
  const showFallback = missingTarget && !rect;

  const handleNext = () => {
    const next = nextVisibleVideosTutorialIndex(stepIndex, canPlay);
    if (next >= 0) {
      setRect(null);
      setMissingTarget(false);
      setStepIndex(next);
      return;
    }
    finishTutorial(true);
  };

  const pad =
    step.target.startsWith('nav-') || step.target.endsWith('-tab')
      ? NAV_HIGHLIGHT_PAD
      : HIGHLIGHT_PAD;
  const highlight = rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
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
      aria-labelledby="videos-tutorial-title"
      aria-describedby="videos-tutorial-body"
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
        <h2 id="videos-tutorial-title" className="site-tutorial__title">
          {step.title}
        </h2>
        <p id="videos-tutorial-body" className="site-tutorial__body">
          {step.body}
        </p>
        <p className="site-tutorial__hint muted">
          {isLast ? 'Tap the circle to finish.' : 'Tap the circle to continue.'}
        </p>
      </div>
    </div>
  );
}
