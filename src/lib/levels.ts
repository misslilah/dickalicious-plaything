export type UserStage = 'beginner' | 'intermediate' | 'trained' | 'mindless';
export type TaskUserStage = UserStage | 'any';

const STAGE_LABELS: Record<UserStage, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  trained: 'Trained',
  mindless: 'Mindless',
};

export const USER_STAGE_OPTIONS: { value: TaskUserStage; label: string }[] = [
  { value: 'any', label: 'All users' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'trained', label: 'Trained' },
  { value: 'mindless', label: 'Mindless' },
];

export function getUserStage(level: number): UserStage {
  if (level <= 10) return 'beginner';
  if (level <= 25) return 'intermediate';
  if (level <= 50) return 'trained';
  return 'mindless';
}

export function getStageLabel(stage: UserStage | TaskUserStage): string {
  if (stage === 'any') return 'All users';
  return STAGE_LABELS[stage];
}

/** XP required to advance from `currentLevel` to `currentLevel + 1`. */
export function xpRequiredForNextLevel(currentLevel: number): number {
  const stage = getUserStage(currentLevel);
  switch (stage) {
    case 'beginner':
      if (currentLevel === 10) return 250;
      return 100 + (currentLevel - 1) * 12;
    case 'intermediate':
      return 250 + (currentLevel - 10) * 25;
    case 'trained':
      return 500 + (currentLevel - 25) * 30;
    case 'mindless':
      return 800 + (currentLevel - 50) * 40;
  }
}

/** Cumulative XP required to reach `targetLevel` (level 1 = 0 XP). */
export function totalXpForLevel(targetLevel: number): number {
  if (targetLevel <= 1) return 0;
  let total = 0;
  for (let level = 1; level < targetLevel; level++) {
    total += xpRequiredForNextLevel(level);
  }
  return total;
}

export function getLevelFromXp(totalXp: number): number {
  let level = 1;
  while (totalXp >= totalXpForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

export function xpToNextLevel(totalXp: number, currentLevel: number): number {
  const needed = totalXpForLevel(currentLevel + 1);
  return Math.max(0, needed - totalXp);
}

export function xpProgressInLevel(
  totalXp: number,
  currentLevel: number,
): { current: number; max: number; percent: number } {
  const floor = totalXpForLevel(currentLevel);
  const max = xpRequiredForNextLevel(currentLevel);
  const current = totalXp - floor;
  return {
    current,
    max,
    percent: max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 100,
  };
}

export function formatLevelDisplay(level: number): string {
  return `Level ${level} — ${getStageLabel(getUserStage(level))}`;
}

export function taskMatchesUserStage(
  task: { userStage?: TaskUserStage },
  userLevel: number,
): boolean {
  const stage = task.userStage ?? 'any';
  if (stage === 'any') return true;
  return stage === getUserStage(userLevel);
}
