import {
  isCategoryTutorialOpen,
} from './categoryTutorial';
import {
  isSiteTutorialDone,
  isSiteTutorialOpen,
  queryTutorialTarget,
} from './siteTutorial';
import { isUniversityTutorialOpen } from './universityTutorial';
import {
  canAccessVideoCategory,
  type VideoAccessContext,
} from './videoAccess';
import type { Video, VideoCategory } from '../types';

export const VIDEOS_TUTORIAL_STORAGE_KEY = 'videos-tutorial-done';
export const VIDEOS_TUTORIAL_REQUEST_EVENT = 'videos-tutorial-request';
export const VIDEOS_TUTORIAL_DONE_EVENT = 'videos-tutorial-done';
export const VIDEOS_TUTORIAL_TAB_EVENT = 'videos-tutorial-tab';

export type VideosTutorialPlacement = 'top' | 'bottom';
export type VideosTutorialMediaTab = 'videos' | 'interactive';
export type VideosTutorialRoute = 'catalog' | 'play';

export type VideosTutorialStep = {
  id: string;
  title: string;
  body: string;
  target: string;
  placement: VideosTutorialPlacement;
  route: VideosTutorialRoute;
  mediaTab?: VideosTutorialMediaTab;
};

export const VIDEOS_TUTORIAL_STEPS: VideosTutorialStep[] = [
  {
    id: 'catalog',
    title: 'Videos catalog',
    body: 'This is Videos. Use this tab for the catalog — categories, playlists, and everything you can watch.',
    target: 'videos-tab',
    placement: 'bottom',
    route: 'catalog',
    mediaTab: 'videos',
  },
  {
    id: 'tiers',
    title: 'Patreon tiers',
    body: 'Sweetie, Princess, and Slut unlock more videos. Higher tiers include everything below. Link Patreon in Settings to claim your access.',
    target: 'videos-tiers',
    placement: 'bottom',
    route: 'catalog',
    mediaTab: 'videos',
  },
  {
    id: 'playlists',
    title: 'Playlists',
    body: 'Create a personal playlist, then tap Play. Videos play one after another in order.',
    target: 'videos-playlists',
    placement: 'bottom',
    route: 'catalog',
    mediaTab: 'videos',
  },
  {
    id: 'shop',
    title: 'Shop & points',
    body: 'Unlock extra videos with task points in the Shop — Sweetie, Princess, or Slut — or buy a specific priced video.',
    target: 'videos-shop',
    placement: 'bottom',
    route: 'catalog',
    mediaTab: 'videos',
  },
  {
    id: 'interactive',
    title: 'Interactive videos',
    body: 'Interactive videos pause at cues and use your camera to check gestures. Open this tab to browse them and build interactive playlists.',
    target: 'videos-interactive-tab',
    placement: 'bottom',
    route: 'catalog',
    mediaTab: 'interactive',
  },
  {
    id: 'play',
    title: 'Play a video',
    body: 'Pick a video, then choose Normal play or Forced Mode. Forced Mode locks the view until it ends. Loop is only on Normal play.',
    target: 'videos-play',
    placement: 'bottom',
    route: 'play',
  },
];

let videosTutorialOpen = false;
let pendingMediaTab: VideosTutorialMediaTab | null = null;

export function isVideosTutorialOpen(): boolean {
  return videosTutorialOpen;
}

export function setVideosTutorialOpen(open: boolean): void {
  videosTutorialOpen = open;
}

export function requestVideosMediaTab(tab: VideosTutorialMediaTab): void {
  pendingMediaTab = tab;
  window.dispatchEvent(
    new CustomEvent(VIDEOS_TUTORIAL_TAB_EVENT, { detail: tab }),
  );
}

export function consumePendingVideosMediaTab(): VideosTutorialMediaTab | null {
  const tab = pendingMediaTab;
  pendingMediaTab = null;
  return tab;
}

export function isVideosTutorialDone(): boolean {
  try {
    return localStorage.getItem(VIDEOS_TUTORIAL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markVideosTutorialDone(): void {
  try {
    localStorage.setItem(VIDEOS_TUTORIAL_STORAGE_KEY, 'true');
  } catch {
    /* private mode / blocked storage */
  }
  window.dispatchEvent(new Event(VIDEOS_TUTORIAL_DONE_EVENT));
}

export function requestVideosTutorial(): void {
  window.dispatchEvent(new Event(VIDEOS_TUTORIAL_REQUEST_EVENT));
}

export function isVideosPath(pathname: string): boolean {
  return pathname === '/videos' || pathname.startsWith('/videos/');
}

export function isVideoCategoryPath(pathname: string): boolean {
  return /^\/videos\/category\/[^/]+$/.test(pathname);
}

export function videoCategoryIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/videos\/category\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function isVideosTutorialBlocked(): boolean {
  return (
    !isSiteTutorialDone() ||
    isSiteTutorialOpen() ||
    isCategoryTutorialOpen() ||
    isUniversityTutorialOpen()
  );
}

export function visibleVideosTutorialSteps(): VideosTutorialStep[] {
  return VIDEOS_TUTORIAL_STEPS.filter((step) =>
    Boolean(queryTutorialTarget(step.target)),
  );
}

export function canAutoStartVideosTutorial(): boolean {
  return !isVideosTutorialDone() && !isVideosTutorialBlocked();
}

export function videosTutorialStepReachable(
  step: VideosTutorialStep,
  canPlay: boolean,
): boolean {
  if (step.route === 'play') return canPlay;
  return (
    Boolean(queryTutorialTarget(step.target)) ||
    (typeof window !== 'undefined' && window.location.pathname !== '/videos')
  );
}

export function nextVisibleVideosTutorialIndex(
  fromIndex: number,
  canPlay = false,
): number {
  for (let i = fromIndex + 1; i < VIDEOS_TUTORIAL_STEPS.length; i += 1) {
    if (videosTutorialStepReachable(VIDEOS_TUTORIAL_STEPS[i], canPlay)) return i;
  }
  return -1;
}

export function firstVisibleVideosTutorialIndex(canPlay = false): number {
  return VIDEOS_TUTORIAL_STEPS.findIndex((step) =>
    videosTutorialStepReachable(step, canPlay),
  );
}

function isPlayableVideoCategory(
  category: VideoCategory,
  videos: readonly Video[],
  ctx: VideoAccessContext,
): boolean {
  const inCategory = videos.filter((video) => video.categoryId === category.id);
  return (
    inCategory.length > 0 && canAccessVideoCategory(category, inCategory, ctx)
  );
}

export function firstPlayableVideoCategoryPath(
  categories: readonly VideoCategory[],
  videos: readonly Video[],
  ctx: VideoAccessContext,
): string | null {
  const sorted = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  for (const category of sorted) {
    if (isPlayableVideoCategory(category, videos, ctx)) {
      return `/videos/category/${category.id}`;
    }
  }
  return null;
}

export function isPlayableVideoCategoryPath(
  pathname: string,
  categories: readonly VideoCategory[],
  videos: readonly Video[],
  ctx: VideoAccessContext,
): boolean {
  const categoryId = videoCategoryIdFromPath(pathname);
  if (!categoryId) return false;
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return false;
  return isPlayableVideoCategory(category, videos, ctx);
}
