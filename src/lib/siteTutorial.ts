export const SITE_TUTORIAL_STORAGE_KEY = 'site-tutorial-done';
export const SITE_TUTORIAL_REQUEST_EVENT = 'site-tutorial-request';
export const SITE_TUTORIAL_DONE_EVENT = 'site-tutorial-done';

export type SiteTutorialPlacement = 'top' | 'bottom';

export type SiteTutorialStep = {
  id: string;
  title: string;
  body: string;
  route: string;
  target: string;
  placement: SiteTutorialPlacement;
};

export const SITE_TUTORIAL_NAV_TARGETS: Record<string, string> = {
  '/videos': 'nav-videos',
  '/mini-games': 'nav-games',
  '/punishments': 'nav-punishments',
  '/rewards': 'nav-shop',
  '/shop': 'nav-shop',
  '/community': 'nav-community',
};

export const SITE_TUTORIAL_STEPS: SiteTutorialStep[] = [
  {
    id: 'home',
    title: 'Home & your level',
    body: 'This is Home. Your title, level, and XP sit here at the top — complete tasks to climb. Skip anytime; replay later from Settings.',
    route: '/',
    target: 'home-xp',
    placement: 'bottom',
  },
  {
    id: 'categories',
    title: 'Join a category',
    body: 'Tap a category card to join. You can follow up to three at a time, and each one has its own tasks.',
    route: '/',
    target: 'category-card',
    placement: 'bottom',
  },
  {
    id: 'tasks',
    title: 'Daily vs category tasks',
    body: 'Daily tasks live here on Home and refresh on a schedule. Category tasks live inside a category you joined. Both earn XP.',
    route: '/',
    target: 'daily-tasks',
    placement: 'bottom',
  },
  {
    id: 'games',
    title: 'Games',
    body: 'Games is in the bottom nav. Open it for mini-games when you want a round — some are gated by Patreon tier.',
    route: '/mini-games',
    target: 'nav-games',
    placement: 'top',
  },
  {
    id: 'punishments',
    title: 'Punishments',
    body: 'Punishments is in the nav. This is where you take your lumps when you fall behind.',
    route: '/punishments',
    target: 'nav-punishments',
    placement: 'top',
  },
  {
    id: 'shop',
    title: 'Shop',
    body: 'Shop is next to it. Spend task points in the Item Shop — featured banners, videos, and cosmetics.',
    route: '/shop',
    target: 'nav-shop',
    placement: 'top',
  },
];

export function queryTutorialTarget(target: string): HTMLElement | null {
  return document.querySelector(`[data-tutorial="${CSS.escape(target)}"]`);
}

export function isSiteTutorialDone(): boolean {
  try {
    return localStorage.getItem(SITE_TUTORIAL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markSiteTutorialDone(): void {
  try {
    localStorage.setItem(SITE_TUTORIAL_STORAGE_KEY, 'true');
  } catch {
    /* private mode / blocked storage */
  }
  window.dispatchEvent(new Event(SITE_TUTORIAL_DONE_EVENT));
}

export function requestSiteTutorial(): void {
  window.dispatchEvent(new Event(SITE_TUTORIAL_REQUEST_EVENT));
}

let siteTutorialOpen = false;

export function isSiteTutorialOpen(): boolean {
  return siteTutorialOpen;
}

export function setSiteTutorialOpen(open: boolean): void {
  siteTutorialOpen = open;
}
