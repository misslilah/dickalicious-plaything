import type { TaskUserStage, UserStage } from '../lib/levels';

export type TaskFrequency = 'daily' | 'weekly' | 'once';

/** Recurring obligation for category tasks (accept once, complete each period). */
export type TaskRecurrence = 'none' | 'daily' | 'weekly';

export type TaskScope = 'category' | 'daily' | 'custom';

export type TaskLinkedMediaType = 'none' | 'video' | 'audio';

/** Uploaded video or audio file attached to a specific task. */
export type TaskMediaType = 'video' | 'audio';

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
  /** Optional video or audio the user must finish before completing. */
  linkedMediaType?: TaskLinkedMediaType;
  /** Catalog video when linkedMediaType is `video`. */
  linkedVideoId?: string;
  /** Audio library track when linkedMediaType is `audio`. */
  linkedAudioItemId?: string;
  /** External audio URL when linkedMediaType is `audio` (alternative to library track). */
  linkedAudioUrl?: string;
  /** Task-specific uploaded media URL (Supabase task-media bucket). */
  taskMediaUrl?: string;
  /** `video` or `audio` for taskMediaUrl. */
  taskMediaType?: TaskMediaType;
  /** Display order within the category (lower first). */
  sortOrder?: number;
  /** Must complete this task in the same category first. */
  prerequisiteTaskId?: string | null;
  /** Exam tasks unlock after all regular category tasks are completed. */
  isExamTask?: boolean;
  /** Category tasks only: daily/weekly obligation after acceptance. */
  recurrence?: TaskRecurrence;
}

export interface RecurringTaskCompletion {
  taskId: string;
  /** Period start date (YYYY-MM-DD): calendar day for daily, Monday for weekly. */
  periodKey: string;
  completedAt?: string;
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
  /** Exact phrase(s) the user must type to complete (each phrase typed repeat count times). */
  requiredPhrases?: string[];
  /** How many times each phrase must be typed correctly (default 1). */
  requiredPhraseRepeatCount?: number;
  /** Countdown timer before the punishment can be completed. */
  timerSeconds?: number;
  /** URL the user must open before completing. */
  openUrl?: string;
  /** When true, completion requires Throne gift webhook matching throneAmountCents. */
  thronePayment?: boolean;
  /** Expected Throne gift amount in cents (e.g. 500 = €5) for webhook tier matching. */
  throneAmountCents?: number | null;
  /** Throne wishlist item id (optional metadata; amount_cents is primary for webhooks). */
  throneGiftId?: string | null;
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
  /** Catalog template this completion came from (malus relief flow). */
  templateId?: string;
  /** When the user finished the punishment requirements. */
  completedAt?: string;
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
export type TrainingProofStatus = 'pending' | 'approved' | 'rejected';

export interface TrainingTask {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  videoPath?: string | null;
  requiredPhrase?: string;
  requiredPhraseRepeatCount?: number;
  timerSeconds?: number;
  openUrl?: string;
  /** When true, completion requires Throne gift webhook or admin confirmation. */
  thronePayment?: boolean;
  requiresProofPhoto: boolean;
  isActive: boolean;
  /** When set, task is personal training for this user only. */
  assignedUserId?: string | null;
}

export type ThronePaymentPendingStatus =
  | 'waiting'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface ThronePaymentPending {
  id: string;
  userId: string;
  /** Set for training task Throne payments. */
  taskId?: string | null;
  /** Set for punishment Throne payments. */
  punishmentTemplateId?: string | null;
  status: ThronePaymentPendingStatus;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  giftEventId: string | null;
  /** Populated on admin list fetches (profile join). */
  username?: string;
  /** Populated on admin list fetches (training task join). */
  taskTitle?: string;
  /** Populated on admin list fetches (punishment template join). */
  punishmentTitle?: string;
  /** Populated on admin list fetches (punishment template join). */
  throneAmountCents?: number | null;
}

export interface ThroneGiftEvent {
  id: string;
  receivedAt: string;
  eventType: string;
  gifterName: string | null;
  itemName: string | null;
  amountCents: number | null;
  currency: string | null;
  matchedUserId: string | null;
  matchedTaskId: string | null;
  matchedPunishmentTemplateId?: string | null;
  payload?: Record<string, unknown> | null;
}

/** Active Slut-tier member for admin Training → Sluts tab. */
export interface SlutTrainingMember {
  id: string;
  username: string;
  blackmailEnabled: boolean;
  pendingProofCount: number;
}

export interface TrainingTaskCompletion {
  id: string;
  userId: string;
  taskId: string;
  completedAt: string;
  proofPhotoPath?: string | null;
  proofStatus?: TrainingProofStatus | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export interface TrainingBlackmailProfile {
  enabled: boolean;
  consentedAt: string | null;
}

/** Admin view of a proof submission pending verification. */
export interface TrainingProofSubmission {
  completionId: string;
  userId: string;
  username: string;
  taskId: string;
  taskTitle: string;
  completedAt: string;
  proofPhotoPath: string;
  proofStatus: TrainingProofStatus;
}

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
  /** Length in seconds from upload metadata; null for legacy uploads. */
  durationSeconds?: number | null;
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
  /** Recurring category tasks the user has accepted. */
  acceptedRecurringTaskIds: string[];
  /** Server-synced per-period completions for recurring category tasks. */
  recurringTaskCompletions: RecurringTaskCompletion[];
  version: number;
}
