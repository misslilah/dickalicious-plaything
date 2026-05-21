import type { AppState, PunishmentTemplate } from '../types';
import { DEFAULT_LEVELS } from './levels';

export const DEFAULT_PUNISHMENT_TEMPLATES: PunishmentTemplate[] = [
  {
    id: 'pun-tpl-points',
    title: 'Points lost',
    description: 'Daily quota not met — points deducted',
    trigger: { type: 'quota_miss' },
    pointsLost: 15,
  },
  {
    id: 'pun-tpl-bonus',
    title: 'Bonus task tomorrow',
    description: 'An extra task will be added to your plan',
    trigger: { type: 'quota_miss' },
    pointsLost: 0,
  },
];

export function createInitialState(): AppState {
  return {
    categories: [],
    levels: DEFAULT_LEVELS,
    tasks: [],
    videoCategories: [],
    videos: [],
    progress: {
      totalXp: 0,
      currentLevel: 1,
      streak: 0,
      lastActiveDate: null,
      points: 0,
    },
    dailyPlans: {},
    rewards: [],
    punishmentTemplates: [...DEFAULT_PUNISHMENT_TEMPLATES],
    punishments: [],
    settings: {
      dailyQuotaPercent: 80,
      resetHour: 4,
    },
    unlockedRewardIds: [],
    version: 4,
  };
}
