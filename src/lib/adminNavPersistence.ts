/** Admin panel + sub-tab state in sessionStorage and optional URL search params. */

export const ADMIN_NAV_STORAGE_KEY = 'admin-nav';
const LEGACY_ADMIN_NAV_STORAGE_KEY = 'dickalicious-admin-nav';

export const ADMIN_SECTION_PARAM = 'section';
/** @deprecated Legacy alias for {@link ADMIN_SECTION_PARAM} */
export const ADMIN_PANEL_PARAM = 'panel';
export const ADMIN_VIDEOS_TAB_PARAM = 'videosTab';
/** Shorthand when `section=videos` (e.g. `tab=upload` → uploads) */
export const ADMIN_VIDEOS_TAB_SHORT_PARAM = 'tab';
export const ADMIN_REWARDS_TAB_PARAM = 'rewardsTab';
export const ADMIN_MINIGAMES_TAB_PARAM = 'minigamesTab';

export const ADMIN_SECTIONS = [
  'categories',
  'tasks',
  'rewards',
  'punishments',
  'users',
  'videos',
  'gifbank',
  'audio',
  'minigames',
] as const;

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number];

export const ADMIN_VIDEOS_TABS = ['categories', 'uploads', 'interactive'] as const;
export type AdminVideosTab = (typeof ADMIN_VIDEOS_TABS)[number];

export const ADMIN_REWARDS_TABS = ['catalog', 'badges'] as const;
export type AdminRewardsTab = (typeof ADMIN_REWARDS_TABS)[number];

export const ADMIN_MINIGAMES_TABS = ['flash-cards', 'follow-instinct'] as const;
export type AdminMinigamesTab = (typeof ADMIN_MINIGAMES_TABS)[number];

export type AdminNavSnapshot = {
  section: AdminSectionId;
  videosTab?: AdminVideosTab;
  rewardsTab?: AdminRewardsTab;
  minigamesTab?: AdminMinigamesTab;
};

const ADMIN_NAV_PARAM_KEYS = [
  ADMIN_SECTION_PARAM,
  ADMIN_PANEL_PARAM,
  ADMIN_VIDEOS_TAB_PARAM,
  ADMIN_VIDEOS_TAB_SHORT_PARAM,
  ADMIN_REWARDS_TAB_PARAM,
  ADMIN_MINIGAMES_TAB_PARAM,
] as const;

function includes<T extends string>(allowed: readonly T[], value: string | null): value is T {
  return value !== null && (allowed as readonly string[]).includes(value);
}

export function isAdminSectionId(value: string | null): value is AdminSectionId {
  return includes(ADMIN_SECTIONS, value);
}

export function isAdminVideosTab(value: string | null): value is AdminVideosTab {
  return includes(ADMIN_VIDEOS_TABS, value);
}

function normalizeVideosTabParam(value: string | null): AdminVideosTab | null {
  if (value === 'upload') return 'uploads';
  return isAdminVideosTab(value) ? value : null;
}

export function isAdminRewardsTab(value: string | null): value is AdminRewardsTab {
  return includes(ADMIN_REWARDS_TABS, value);
}

export function isAdminMinigamesTab(value: string | null): value is AdminMinigamesTab {
  return includes(ADMIN_MINIGAMES_TABS, value);
}

export function parseAdminNavFromSearchParams(
  params: URLSearchParams,
): AdminNavSnapshot {
  const sectionRaw = params.get(ADMIN_SECTION_PARAM) ?? params.get(ADMIN_PANEL_PARAM);
  const section = isAdminSectionId(sectionRaw) ? sectionRaw : 'categories';

  const videosTabRaw =
    params.get(ADMIN_VIDEOS_TAB_PARAM) ??
    (section === 'videos' ? params.get(ADMIN_VIDEOS_TAB_SHORT_PARAM) : null);
  const videosTab = normalizeVideosTabParam(videosTabRaw) ?? undefined;

  const rewardsTabRaw = params.get(ADMIN_REWARDS_TAB_PARAM);
  const rewardsTab = isAdminRewardsTab(rewardsTabRaw) ? rewardsTabRaw : undefined;

  const minigamesTabRaw = params.get(ADMIN_MINIGAMES_TAB_PARAM);
  const minigamesTab = isAdminMinigamesTab(minigamesTabRaw) ? minigamesTabRaw : undefined;

  return { section, videosTab, rewardsTab, minigamesTab };
}

export function adminNavToSearchParams(nav: AdminNavSnapshot): URLSearchParams {
  const params = new URLSearchParams();
  if (nav.section !== 'categories') {
    params.set(ADMIN_SECTION_PARAM, nav.section);
  }
  if (nav.section === 'videos' && nav.videosTab && nav.videosTab !== 'categories') {
    const tabValue = nav.videosTab === 'uploads' ? 'upload' : nav.videosTab;
    params.set(ADMIN_VIDEOS_TAB_SHORT_PARAM, tabValue);
  } else if (nav.videosTab && nav.videosTab !== 'categories') {
    params.set(ADMIN_VIDEOS_TAB_PARAM, nav.videosTab);
  }
  if (nav.rewardsTab && nav.rewardsTab !== 'catalog') {
    params.set(ADMIN_REWARDS_TAB_PARAM, nav.rewardsTab);
  }
  if (nav.minigamesTab && nav.minigamesTab !== 'flash-cards') {
    params.set(ADMIN_MINIGAMES_TAB_PARAM, nav.minigamesTab);
  }
  return params;
}

function parseStoredAdminNav(raw: string): AdminNavSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<
      AdminNavSnapshot & { panel?: string }
    >;
    const sectionRaw = parsed.section ?? parsed.panel ?? null;
    if (!isAdminSectionId(sectionRaw)) return null;
    return {
      section: sectionRaw,
      videosTab: normalizeVideosTabParam(parsed.videosTab ?? null) ?? undefined,
      rewardsTab: isAdminRewardsTab(parsed.rewardsTab ?? null)
        ? parsed.rewardsTab
        : undefined,
      minigamesTab: isAdminMinigamesTab(parsed.minigamesTab ?? null)
        ? parsed.minigamesTab
        : undefined,
    };
  } catch {
    return null;
  }
}

export function loadAdminNavFromStorage(): AdminNavSnapshot | null {
  try {
    for (const key of [ADMIN_NAV_STORAGE_KEY, LEGACY_ADMIN_NAV_STORAGE_KEY]) {
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = parseStoredAdminNav(raw);
      if (parsed) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAdminNavToStorage(nav: AdminNavSnapshot): void {
  try {
    sessionStorage.setItem(ADMIN_NAV_STORAGE_KEY, JSON.stringify(nav));
  } catch {
    /* quota / private mode */
  }
}

export function saveAdminNavFromSearchParams(params: URLSearchParams): void {
  saveAdminNavToStorage(parseAdminNavFromSearchParams(params));
}

export function hasAdminNavInUrl(params: URLSearchParams): boolean {
  return ADMIN_NAV_PARAM_KEYS.some((key) => params.has(key));
}

export const DEFAULT_ADMIN_NAV: AdminNavSnapshot = { section: 'categories' };

/** User Media page (`/videos`) tab: catalog vs interactive vs audio */
export const VIDEOS_PAGE_TAB_STORAGE_KEY = 'videos-page-tab';

export const MEDIA_PAGE_TABS = ['videos', 'interactive', 'audio', 'watch-log'] as const;
export type MediaPageTab = (typeof MEDIA_PAGE_TABS)[number];

export function isMediaPageTab(value: string | null): value is MediaPageTab {
  return includes(MEDIA_PAGE_TABS, value);
}

export function loadMediaPageTab(): MediaPageTab {
  try {
    const raw = sessionStorage.getItem(VIDEOS_PAGE_TAB_STORAGE_KEY);
    if (isMediaPageTab(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'videos';
}

export function saveMediaPageTab(tab: MediaPageTab): void {
  try {
    sessionStorage.setItem(VIDEOS_PAGE_TAB_STORAGE_KEY, tab);
  } catch {
    /* quota / private mode */
  }
}
