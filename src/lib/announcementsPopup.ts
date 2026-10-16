export const ANNOUNCEMENTS_POPUP_SESSION_KEY = 'announcements-popup-session';
export const ANNOUNCEMENTS_POPUP_DAY_KEY = 'announcements-popup-day';

export function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shouldShowAnnouncementsPopup(): boolean {
  try {
    const sessionSeen =
      sessionStorage.getItem(ANNOUNCEMENTS_POPUP_SESSION_KEY) === 'true';
    const lastDay = localStorage.getItem(ANNOUNCEMENTS_POPUP_DAY_KEY);
    const today = localDayKey();
    return !sessionSeen || lastDay !== today;
  } catch {
    return true;
  }
}

export function markAnnouncementsPopupSeen(): void {
  try {
    sessionStorage.setItem(ANNOUNCEMENTS_POPUP_SESSION_KEY, 'true');
    localStorage.setItem(ANNOUNCEMENTS_POPUP_DAY_KEY, localDayKey());
  } catch {
    /* private mode / blocked storage */
  }
}
