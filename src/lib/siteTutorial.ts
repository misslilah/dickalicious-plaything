export const SITE_TUTORIAL_STORAGE_KEY = 'site-tutorial-done';
export const SITE_TUTORIAL_REQUEST_EVENT = 'site-tutorial-request';
export const SITE_TUTORIAL_DONE_EVENT = 'site-tutorial-done';

export type SiteTutorialPlacement = 'top' | 'bottom';

export type SiteTutorialStep = {
  id: string;
  title: string;
  body: string;
  route: string;
  targets: string[];
  placement: SiteTutorialPlacement;
  preview?: 'announcements';
};

export const SITE_TUTORIAL_NAV_TARGETS: Record<string, string> = {
  '/videos': 'nav-videos',
  '/mini-games': 'nav-games',
  '/university': 'nav-university',
  '/punishments': 'nav-university',
  '/rewards': 'nav-shop',
  '/shop': 'nav-shop',
  '/community': 'nav-community',
};

export const SITE_TUTORIAL_STEPS: SiteTutorialStep[] = [
  {
    id: 'home',
    title: 'This is Home',
    body: 'Your title, level, and XP live here. Complete tasks to climb. Tap the highlighted area to keep going.',
    route: '/',
    targets: ['home-xp'],
    placement: 'bottom',
  },
  {
    id: 'explore',
    title: 'Explore',
    body: 'These four tiles are the campus: Videos, Shop, University, and Games. Tap one later to jump in.',
    route: '/',
    targets: ['home-hub'],
    placement: 'bottom',
  },
  {
    id: 'videos',
    title: 'Videos',
    body: 'Media lives here — catalog, playlists, interactive videos, and audio.',
    route: '/videos',
    targets: ['home-videos', 'videos-tab'],
    placement: 'bottom',
  },
  {
    id: 'shop',
    title: 'Shop',
    body: 'Spend task points on banners, videos, and cosmetics. Your balance sits at the top.',
    route: '/shop',
    targets: ['home-shop'],
    placement: 'bottom',
  },
  {
    id: 'university',
    title: 'University',
    body: 'Campus. Themes are paths; inside a theme, modules hold your tasks. Punishments sit in the other tab.',
    route: '/university',
    targets: ['university-themes', 'university-campus', 'home-hub-university'],
    placement: 'bottom',
  },
  {
    id: 'games',
    title: 'Games',
    body: 'Mini-games live here when you want a round. Some are gated by Patreon tier.',
    route: '/mini-games',
    targets: ['home-games'],
    placement: 'bottom',
  },
  {
    id: 'chat',
    title: 'Chat',
    body: 'The bubble is always there. Open it for rooms, DMs, and Announcements from Dickalicious.',
    route: '/',
    targets: ['home-chat'],
    placement: 'top',
  },
  {
    id: 'announcements',
    title: 'Announcements',
    body: 'Once a session, or when the day changes, this popup catches you up. Close it with Got it.',
    route: '/',
    targets: ['home-announcements'],
    placement: 'bottom',
    preview: 'announcements',
  },
];

export function queryTutorialTarget(target: string): HTMLElement | null {
  return document.querySelector(`[data-tutorial="${CSS.escape(target)}"]`);
}

export function queryTutorialTargets(targets: string[]): HTMLElement | null {
  for (const target of targets) {
    const el = queryTutorialTarget(target);
    if (el) return el;
  }
  return null;
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
