import {
  isSiteTutorialDone,
  isSiteTutorialOpen,
} from './siteTutorial';

export const UNIVERSITY_TUTORIAL_STORAGE_KEY = 'university-tutorial-done';
export const UNIVERSITY_TUTORIAL_REQUEST_EVENT = 'university-tutorial-request';
export const UNIVERSITY_TUTORIAL_DONE_EVENT = 'university-tutorial-done';

let universityTutorialOpen = false;

export function isUniversityTutorialOpen(): boolean {
  return universityTutorialOpen;
}

export function setUniversityTutorialOpen(open: boolean): void {
  universityTutorialOpen = open;
}

export function isUniversityTutorialDone(): boolean {
  try {
    return localStorage.getItem(UNIVERSITY_TUTORIAL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markUniversityTutorialDone(): void {
  try {
    localStorage.setItem(UNIVERSITY_TUTORIAL_STORAGE_KEY, 'true');
  } catch {
    /* private mode / blocked storage */
  }
  window.dispatchEvent(new Event(UNIVERSITY_TUTORIAL_DONE_EVENT));
}

export function requestUniversityTutorial(): void {
  window.dispatchEvent(new Event(UNIVERSITY_TUTORIAL_REQUEST_EVENT));
}

export function isUniversityPath(pathname: string): boolean {
  return pathname === '/university' || pathname.startsWith('/university/');
}

export function isUniversityTutorialBlocked(): boolean {
  return !isSiteTutorialDone() || isSiteTutorialOpen();
}

export function canAutoStartUniversityTutorial(): boolean {
  return !isUniversityTutorialDone() && !isUniversityTutorialBlocked();
}
