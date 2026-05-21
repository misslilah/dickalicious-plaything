export type TaskFrequency = 'daily' | 'weekly' | 'once';

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
}

export interface Level {
  number: 1 | 2 | 3 | 4 | 5;
  name: string;
  xpRequired: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  minLevel: number;
  xpReward: number;
  frequency: TaskFrequency;
  durationMinutes?: number;
  /** Countdown must finish before the task can be completed. */
  timerSeconds?: number;
  /** User must open this URL before completing. */
  openUrl?: string;
  /** Exact phrase (trimmed) the user must type to complete. */
  requiredPhrase?: string;
}

export interface UserProgress {
  totalXp: number;
  currentLevel: number;
  streak: number;
  lastActiveDate: string | null;
  points: number;
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
  | { type: 'manual' };

/** Admin-defined catalog entry applied when quota is missed. */
export interface PunishmentTemplate {
  id: string;
  title: string;
  description: string;
  trigger: PunishmentTrigger;
  pointsLost: number;
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

export interface AppSettings {
  dailyQuotaPercent: number;
  resetHour: number;
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
  levels: Level[];
  tasks: Task[];
  videoCategories: VideoCategory[];
  videos: Video[];
  progress: UserProgress;
  dailyPlans: Record<string, DailyPlan>;
  rewards: Reward[];
  punishmentTemplates: PunishmentTemplate[];
  punishments: Punishment[];
  settings: AppSettings;
  unlockedRewardIds: string[];
  version: number;
}
