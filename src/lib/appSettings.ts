import type { AppSettings } from '../types';

export const BUBBLES_ENABLED_STORAGE_KEY = 'bubbles-enabled';

/** Default true when unset (legacy rows and fresh accounts). */
export function areBubblesEnabled(settings: AppSettings): boolean {
  return settings.bubblesEnabled !== false;
}

export function readBubblesEnabledFromStorage(): boolean | null {
  try {
    const raw = localStorage.getItem(BUBBLES_ENABLED_STORAGE_KEY);
    if (raw === null) return null;
    return raw === 'true';
  } catch {
    return null;
  }
}

export function writeBubblesEnabledToStorage(enabled: boolean): void {
  try {
    localStorage.setItem(BUBBLES_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore quota / private mode
  }
}
