import type { TaskUserStage, UserStage } from '../lib/levels';

export type TaskFrequency = 'daily' | 'weekly' | 'once';

export type TaskScope = 'category' | 'daily' | 'custom';

export type UserRole = 'user' | 'admin';

export type ContentTier = 'public' | 'sweetie' | 'princess' | 'slut';
export type PatreonMemberTier = 'sweetie' | 'princess' | 'slut';
export type PatreonStatus = 'active' | 'cancelled' | 'none';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
}

export interface Session {
  userId: string;
  username: string;
  role: UserRole;
  patreonTier: PatreonMemberTier | null;
  patreonStatus: PatreonStatus;
  patreonUserId: string | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  /** Presentation image (URL or base64 data URL). */
  imageUrl?: string;
  /** Minimum user stage to join; null = anyone. */
  requiredStage?: UserStage | null;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  /** Category library tasks only; null for daily/custom. */
  categoryId?: string | null;
  taskScope: TaskScope;
  /** Required when taskScope is `custom`. */
  assignedUserId?: string | null;
  /** Who this task is for; `any` = all users. */
  userStage?: TaskUserStage;
  xpReward: number;
  frequency: TaskFrequency;
  durationMinutes?: number;
  /** Session countdown; resets if the player leaves the task page before completing. */
  timerSeconds?: number;
  /** Persistent countdown from Start duration; continues after closing the site. */
  durationSeconds?: number;
  /** User must open this URL before completing. */
  openUrl?: string;
  /** Exact phrase (trimmed) the user must type to complete. */
  requiredPhrase?: string;
  /** How many times the phrase must be typed correctly (default 1). */
  requiredPhraseRepeatCount?: number;
  /** Malus added at day end if started (category) or on plan (daily/custom) and incomplete. */
  malusPointsOnFail?: number;
}

export interface UserProgress {
  totalXp: number;
  currentLevel: number;
  streak: number;
  lastActiveDate: string | null;
  points: number;
  malusPoints: number;
}

export interface DailyPlanTask {
  taskId: string;
  completed: boolean;
  completedAt?: string;
}

export interface DailyPlan {
  date: string;
  tasks: DailyPlanTask[];
  closed: boolean;
  extraTaskIds: string[];
  /** Task IDs the user opened or explicitly started today. */
  startedTaskIds?: string[];
}

export type RewardTrigger =
  | { type: 'streak'; days: number }
  | { type: 'level'; level: number };

export interface Reward {
  id: string;
  title: string;
  description: string;
  cost?: number;
  autoTrigger?: RewardTrigger;
  earnedAt?: string;
  purchased?: boolean;
}

export type PunishmentTrigger =
  | { type: 'quota_miss' }
  | { type: 'manual' }
  | { type: 'malus_relief' };

export type PunishmentDifficulty = 'easy' | 'medium' | 'hard';

/** Admin-defined grouping for punishment templates. */
export interface PunishmentCategory {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  /** Section on the Punishments page: Easy / Medium / Hard. */
  difficulty?: PunishmentDifficulty;
  /** Presentation image (URL or base64 data URL). */
  imageUrl?: string;
}

/** Admin-defined catalog entry; user chooses one to reduce malus balance. */
export interface PunishmentTemplate {
  id: string;
  title: string;
  description: string;
  trigger: PunishmentTrigger;
  categoryId?: string | null;
  /** Legacy DB column; prefer categoryId. */
  difficulty?: PunishmentDifficulty;
  malusPointsRelieved: number;
  /** Legacy field; kept for DB compat, not used in malus flow. */
  pointsLost?: number;
}

/** Runtime punishment assigned to the user (not the admin catalog). */
export interface Punishment {
  id: string;
  title: string;
  description: string;
  trigger: PunishmentTrigger;
  pointsLost: number;
  active: boolean;
  assignedAt: string;
  date: string;
}

/** Legacy JSON in user_progress; only resetHour may be read for day boundary. */
export interface AppSettings {
  dailyQuotaPercent?: number;
  resetHour?: number;
}

export interface VideoCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  requiredTier?: ContentTier | null;
}

/** Video metadata; file in Supabase Storage at `storagePath`. */
export interface Video {
  id: string;
  categoryId: string;
  title: string;
  description?: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  requiredTier?: ContentTier | null;
}

export interface AppState {
  categories: Category[];
  tasks: Task[];
  videoCategories: VideoCategory[];
  videos: Video[];
  progress: UserProgress;
  dailyPlans: Record<string, DailyPlan>;
  rewards: Reward[];
  punishmentCategories: PunishmentCategory[];
  punishmentTemplates: PunishmentTemplate[];
  punishments: Punishment[];
  settings: AppSettings;
  unlockedRewardIds: string[];
  /** Category IDs the signed-in user has joined. */
  joinedCategoryIds: string[];
  version: number;
}
