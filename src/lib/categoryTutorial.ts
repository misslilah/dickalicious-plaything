import { isSiteTutorialDone, isSiteTutorialOpen, queryTutorialTarget } from './siteTutorial';
import { isUniversityTutorialOpen } from './universityTutorial';

export const CATEGORY_TUTORIAL_STORAGE_KEY = 'category-tutorial-done';
export const CATEGORY_TUTORIAL_REQUEST_EVENT = 'category-tutorial-request';
export const CATEGORY_TUTORIAL_DONE_EVENT = 'category-tutorial-done';
export const CATEGORY_TUTORIAL_JOIN_SEEN_KEY = 'category-tutorial-join-seen';

export type CategoryTutorialPlacement = 'top' | 'bottom';

export type CategoryTutorialStep = {
  id: string;
  title: string;
  body: string;
  target: string;
  placement: CategoryTutorialPlacement;
};

export const CATEGORY_TUTORIAL_STEPS: CategoryTutorialStep[] = [
  {
    id: 'join',
    title: 'Join this category',
    body: "Join to unlock this category's tasks. You can follow up to three categories at a time.",
    target: 'category-join',
    placement: 'bottom',
  },
  {
    id: 'do-today',
    title: 'Daily & weekly tasks',
    body: 'Recurring tasks live in this strip. Accept each one once, then complete it every day or week until the category is finished.',
    target: 'do-today',
    placement: 'bottom',
  },
  {
    id: 'training-path',
    title: 'Training path',
    body: 'These are one-off tasks. Some stay locked until you finish the step before. Follow the path in order.',
    target: 'training-path',
    placement: 'bottom',
  },
  {
    id: 'task-card',
    title: 'Open a task',
    body: 'Tap a card to open its details. From the modal you can Accept (if recurring), then Start and Complete.',
    target: 'training-path-card',
    placement: 'bottom',
  },
  {
    id: 'exam',
    title: 'Exam chapter',
    body: 'The exam unlocks after you finish the regular tasks. Complete it to mark this category Completed.',
    target: 'exam-chapter',
    placement: 'top',
  },
  {
    id: 'leave',
    title: 'Leave resets progress',
    body: 'Leaving this category wipes its progress. Only leave if you mean to start over.',
    target: 'category-leave',
    placement: 'bottom',
  },
];

export const CATEGORY_TUTORIAL_CONTENT_TARGETS = [
  'do-today',
  'training-path',
  'training-path-card',
  'exam-chapter',
  'category-leave',
] as const;

export function isCategoryTutorialDone(): boolean {
  try {
    return localStorage.getItem(CATEGORY_TUTORIAL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markCategoryTutorialDone(): void {
  try {
    localStorage.setItem(CATEGORY_TUTORIAL_STORAGE_KEY, 'true');
  } catch {
    /* private mode / blocked storage */
  }
  window.dispatchEvent(new Event(CATEGORY_TUTORIAL_DONE_EVENT));
}

export function requestCategoryTutorial(): void {
  window.dispatchEvent(new Event(CATEGORY_TUTORIAL_REQUEST_EVENT));
}

let categoryTutorialOpen = false;

export function isCategoryTutorialOpen(): boolean {
  return categoryTutorialOpen;
}

export function setCategoryTutorialOpen(open: boolean): void {
  categoryTutorialOpen = open;
}

export function isCategoryTutorialJoinSeen(): boolean {
  try {
    return sessionStorage.getItem(CATEGORY_TUTORIAL_JOIN_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markCategoryTutorialJoinSeen(): void {
  try {
    sessionStorage.setItem(CATEGORY_TUTORIAL_JOIN_SEEN_KEY, 'true');
  } catch {
    /* private mode / blocked storage */
  }
}

export function visibleCategoryTutorialSteps(): CategoryTutorialStep[] {
  return CATEGORY_TUTORIAL_STEPS.filter((step) =>
    Boolean(queryTutorialTarget(step.target)),
  );
}

export function categoryTutorialHasPendingContent(): boolean {
  const hasJoin = Boolean(queryTutorialTarget('category-join'));
  const hasContent = CATEGORY_TUTORIAL_CONTENT_TARGETS.some((target) =>
    queryTutorialTarget(target),
  );
  return hasJoin && !hasContent;
}

export function isCategoryTutorialBlockedBySite(): boolean {
  return (
    !isSiteTutorialDone() ||
    isSiteTutorialOpen() ||
    isUniversityTutorialOpen()
  );
}

export function canAutoStartCategoryTutorial(): boolean {
  if (isCategoryTutorialDone() || isCategoryTutorialBlockedBySite()) return false;
  const visible = visibleCategoryTutorialSteps();
  if (visible.length === 0) return false;
  const onlyJoin = visible.every((step) => step.id === 'join');
  return !(onlyJoin && isCategoryTutorialJoinSeen());
}

export function nextVisibleCategoryTutorialIndex(fromIndex: number): number {
  for (let i = fromIndex + 1; i < CATEGORY_TUTORIAL_STEPS.length; i += 1) {
    if (queryTutorialTarget(CATEGORY_TUTORIAL_STEPS[i].target)) return i;
  }
  return -1;
}

export function firstVisibleCategoryTutorialIndex(): number {
  return CATEGORY_TUTORIAL_STEPS.findIndex((step) =>
    Boolean(queryTutorialTarget(step.target)),
  );
}

export function isCategoryDetailPath(pathname: string): boolean {
  return /^\/category\/[^/]+$/.test(pathname);
}
