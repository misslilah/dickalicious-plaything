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

export type CategoryGroup =
  | 'all'
  | 'beginner'
  | 'intermediate'
  | 'trained'
  | 'mindless';

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
  /** Home tier section; `all` shows before tier groups. */
  categoryGroup?: CategoryGroup;
  /** Unlock only after this category is 100% complete. */
  unlockAfterCategoryId?: string | null;
}

export interface CategoryMemberProgress {
  categoryId: string;
  tasksCompletedCount: number;
  markedCompleteAt: string | null;
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
  /** Spendable points earned when the task is completed (Rewards shop). */
  pointsReward?: number;
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

export type BadgeRequirementType = 'task' | 'category' | 'bubble_pops';

/** Auto-unlock rule configured on a profile badge. */
export interface BadgeRequirement {
  type: BadgeRequirementType;
  taskId?: string;
  categoryId?: string;
  /** When set, accumulate this many seconds; when omitted, one-time completion. */
  durationSeconds?: number;
  /** Minimum soap bubbles popped (hidden counter). Used when type is bubble_pops. */
  minBubblePops?: number;
}

/** Profile badge with image (admin catalog). */
export interface Badge {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  isSecret: boolean;
  sortOrder: number;
  requirement?: BadgeRequirement | null;
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

/** Per-user JSON in user_progress.settings (and localStorage fallback for guests). */
export interface AppSettings {
  dailyQuotaPercent?: number;
  resetHour?: number;
  /** Floating soap bubbles; default true when omitted. */
  bubblesEnabled?: boolean;
}

export interface VideoCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  requiredTier?: ContentTier | null;
  /** Display order on the Videos page (lower first). */
  sortOrder: number;
}

/** Admin-defined audio playlist; tracks unlock sequentially within each playlist. */
export interface AudioPlaylist {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  unlockAfterPlaylistId: string | null;
  /** Minimum Patreon tier required; null = everyone with an account. */
  patreonTier: PatreonMemberTier | null;
  createdAt: string;
}

/** Audio playlist track; file in Supabase Storage at `storagePath`. */
export interface AudioPlaylistItem {
  id: string;
  playlistId: string;
  title: string;
  storagePath: string;
  sortOrder: number;
  durationSeconds: number | null;
  url: string;
  createdAt: string;
}

export type VideoPlaylistType = 'normal' | 'interactive';

/** User-owned playlist of catalog videos (normal or interactive). */
export interface VideoPlaylist {
  id: string;
  userId: string;
  title: string;
  type: VideoPlaylistType;
  sortOrder: number;
  createdAt: string;
}

export interface VideoPlaylistItem {
  id: string;
  playlistId: string;
  videoId: string;
  position: number;
  createdAt: string;
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
  /** When true, normal play starts with loop on and a one-time notice. */
  autoLoop?: boolean;
  /** XP earned once when the user watches the full video (0 = none). */
  xpReward?: number;
  /** Reward points to unlock individually in the shop; null/0 = not for sale. */
  shopPointsCost?: number | null;
}

export interface AppState {
  categories: Category[];
  tasks: Task[];
  videoCategories: VideoCategory[];
  /** Total videos per category (includes tier-locked; from get_video_category_counts RPC). */
  videoCategoryCounts: Record<string, number>;
  videos: Video[];
  progress: UserProgress;
  dailyPlans: Record<string, DailyPlan>;
  rewards: Reward[];
  badges: Badge[];
  punishmentCategories: PunishmentCategory[];
  punishmentTemplates: PunishmentTemplate[];
  punishments: Punishment[];
  settings: AppSettings;
  unlockedRewardIds: string[];
  /** Video IDs unlocked via the Rewards shop (individual purchase). */
  purchasedVideoIds: string[];
  unlockedBadgeIds: string[];
  /** Category IDs the signed-in user has joined. */
  joinedCategoryIds: string[];
  /** Per-category completion synced from category_members. */
  categoryMemberProgress: CategoryMemberProgress[];
  version: number;
}
