import type { Level } from '../types';

export const DEFAULT_LEVELS: Level[] = [
  { number: 1, name: 'Beginner', xpRequired: 0 },
  { number: 2, name: 'Apprentice', xpRequired: 100 },
  { number: 3, name: 'Disciplined', xpRequired: 300 },
  { number: 4, name: 'Dedicated', xpRequired: 600 },
  { number: 5, name: 'Self-mastered', xpRequired: 1000 },
];

export function getLevelFromXp(totalXp: number, levels: Level[]): number {
  let level = 1;
  for (const l of levels) {
    if (totalXp >= l.xpRequired) level = l.number;
  }
  return level;
}

export function xpToNextLevel(totalXp: number, levels: Level[]): number {
  const current = getLevelFromXp(totalXp, levels);
  const next = levels.find((l) => l.number === current + 1);
  if (!next) return 0;
  return Math.max(0, next.xpRequired - totalXp);
}

export function xpProgressInLevel(totalXp: number, levels: Level[]): {
  current: number;
  max: number;
  percent: number;
} {
  const levelNum = getLevelFromXp(totalXp, levels);
  const currentLevel = levels.find((l) => l.number === levelNum)!;
  const nextLevel = levels.find((l) => l.number === levelNum + 1);
  if (!nextLevel) {
    return { current: totalXp - currentLevel.xpRequired, max: 1, percent: 100 };
  }
  const current = totalXp - currentLevel.xpRequired;
  const max = nextLevel.xpRequired - currentLevel.xpRequired;
  return { current, max, percent: Math.min(100, Math.round((current / max) * 100)) };
}
