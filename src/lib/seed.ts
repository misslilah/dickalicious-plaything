import type {
  AppState,
  PunishmentCategory,
  PunishmentTemplate,
} from '../types';

export const DEFAULT_PUNISHMENT_CATEGORIES: PunishmentCategory[] = [
  {
    id: 'pun-cat-easy',
    name: 'Easy',
    description: 'Light malus relief',
    sortOrder: 0,
    difficulty: 'easy',
  },
  {
    id: 'pun-cat-medium',
    name: 'Medium',
    description: 'Moderate malus relief',
    sortOrder: 1,
    difficulty: 'medium',
  },
  {
    id: 'pun-cat-hard',
    name: 'Hard',
    description: 'Heavy malus relief',
    sortOrder: 2,
    difficulty: 'hard',
  },
];

export const DEFAULT_PUNISHMENT_TEMPLATES: PunishmentTemplate[] = [
  {
    id: 'pun-tpl-easy',
    title: 'Light discipline',
    description: 'A small corrective task to clear minor malus.',
    trigger: { type: 'malus_relief' },
    categoryId: 'pun-cat-easy',
    malusPointsRelieved: 5,
  },
  {
    id: 'pun-tpl-medium',
    title: 'Standard punishment',
    description: 'Moderate effort to reduce malus balance.',
    trigger: { type: 'malus_relief' },
    categoryId: 'pun-cat-medium',
    malusPointsRelieved: 15,
  },
  {
    id: 'pun-tpl-hard',
    title: 'Heavy punishment',
    description: 'Serious consequence for a large malus balance.',
    trigger: { type: 'malus_relief' },
    categoryId: 'pun-cat-hard',
    malusPointsRelieved: 30,
  },
];

export function createInitialState(): AppState {
  return {
    categories: [],
    tasks: [],
    videoCategories: [],
    videoCategoryCounts: {},
    videos: [],
    progress: {
      totalXp: 0,
      currentLevel: 1,
      streak: 0,
      lastActiveDate: null,
      points: 0,
      malusPoints: 0,
    },
    dailyPlans: {},
    rewards: [],
    badges: [],
    punishmentCategories: [...DEFAULT_PUNISHMENT_CATEGORIES],
    punishmentTemplates: [...DEFAULT_PUNISHMENT_TEMPLATES],
    punishments: [],
    settings: {},
    unlockedRewardIds: [],
    purchasedVideoIds: [],
    unlockedBadgeIds: [],
    joinedCategoryIds: [],
    categoryMemberProgress: [],
    acceptedRecurringTaskIds: [],
    recurringTaskCompletions: [],
    version: 8,
  };
}
