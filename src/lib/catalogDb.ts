import type {
  Category,
  ContentTier,
  PunishmentTemplate,
  PunishmentTrigger,
  Reward,
  RewardTrigger,
  Task,
  TaskFrequency,
  Video,
  VideoCategory,
} from '../types';
import { getSupabase } from './supabase';

export interface SharedCatalog {
  categories: Category[];
  tasks: Task[];
  rewards: Reward[];
  punishmentTemplates: PunishmentTemplate[];
  videoCategories: VideoCategory[];
  videos: Video[];
}

type DbCategory = {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  image_url: string | null;
  sort_order: number;
};

type DbTask = {
  id: string;
  category_id: string;
  title: string;
  description: string;
  min_level: number;
  xp_reward: number;
  frequency: TaskFrequency;
  duration_minutes: number | null;
  timer_seconds: number | null;
  open_url: string | null;
  required_phrase: string | null;
};

type DbReward = {
  id: string;
  title: string;
  description: string;
  cost_points: number | null;
  reward_type: 'shop' | 'badge';
  trigger_type: 'streak' | 'level' | null;
  streak_days: number | null;
  level_required: number | null;
};

type DbPunishmentTemplate = {
  id: string;
  title: string;
  description: string;
  trigger_type: PunishmentTrigger['type'];
  points_lost: number;
};

type DbVideoCategory = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  required_tier: ContentTier | null;
};

type DbVideo = {
  id: string;
  video_category_id: string;
  title: string;
  description: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  required_tier: ContentTier | null;
};

function mapCategory(row: DbCategory): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    imageUrl: row.image_url ?? undefined,
  };
}

function mapTask(row: DbTask): Task {
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.title,
    description: row.description,
    minLevel: row.min_level,
    xpReward: row.xp_reward,
    frequency: row.frequency,
    durationMinutes: row.duration_minutes ?? undefined,
    timerSeconds: row.timer_seconds ?? undefined,
    openUrl: row.open_url ?? undefined,
    requiredPhrase: row.required_phrase ?? undefined,
  };
}

function mapReward(row: DbReward): Reward {
  let autoTrigger: RewardTrigger | undefined;
  if (row.reward_type === 'badge' && row.trigger_type === 'streak' && row.streak_days) {
    autoTrigger = { type: 'streak', days: row.streak_days };
  } else if (
    row.reward_type === 'badge' &&
    row.trigger_type === 'level' &&
    row.level_required
  ) {
    autoTrigger = { type: 'level', level: row.level_required };
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    cost: row.cost_points ?? undefined,
    autoTrigger,
  };
}

function mapPunishmentTemplate(row: DbPunishmentTemplate): PunishmentTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    trigger: { type: row.trigger_type } as PunishmentTrigger,
    pointsLost: row.points_lost,
  };
}

function mapVideoCategory(row: DbVideoCategory): VideoCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    requiredTier: row.required_tier ?? undefined,
  };
}

function mapVideo(row: DbVideo): Video {
  return {
    id: row.id,
    categoryId: row.video_category_id,
    title: row.title,
    description: row.description ?? undefined,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    requiredTier: row.required_tier ?? undefined,
  };
}

function rewardToDb(reward: Reward): Omit<DbReward, 'id'> & { id?: string } {
  const isBadge = reward.autoTrigger != null;
  return {
    id: reward.id || undefined,
    title: reward.title,
    description: reward.description,
    cost_points: isBadge ? null : (reward.cost ?? 50),
    reward_type: isBadge ? 'badge' : 'shop',
    trigger_type: reward.autoTrigger?.type ?? null,
    streak_days:
      reward.autoTrigger?.type === 'streak' ? reward.autoTrigger.days : null,
    level_required:
      reward.autoTrigger?.type === 'level' ? reward.autoTrigger.level : null,
  };
}

export async function fetchSharedCatalog(): Promise<
  { ok: true; catalog: SharedCatalog } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const [
    categoriesRes,
    tasksRes,
    rewardsRes,
    punishmentsRes,
    videoCategoriesRes,
    videosRes,
  ] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('rewards').select('*').order('created_at'),
    supabase.from('punishment_templates').select('*').order('created_at'),
    supabase.from('video_categories').select('*').order('sort_order'),
    supabase.from('videos').select('*').order('created_at', { ascending: false }),
  ]);

  const firstError =
    categoriesRes.error ??
    tasksRes.error ??
    rewardsRes.error ??
    punishmentsRes.error ??
    videoCategoriesRes.error ??
    videosRes.error;

  if (firstError) {
    return { ok: false, error: firstError.message };
  }

  return {
    ok: true,
    catalog: {
      categories: (categoriesRes.data as DbCategory[]).map(mapCategory),
      tasks: (tasksRes.data as DbTask[]).map(mapTask),
      rewards: (rewardsRes.data as DbReward[]).map(mapReward),
      punishmentTemplates: (punishmentsRes.data as DbPunishmentTemplate[]).map(
        mapPunishmentTemplate,
      ),
      videoCategories: (videoCategoriesRes.data as DbVideoCategory[]).map(
        mapVideoCategory,
      ),
      videos: (videosRes.data as DbVideo[]).map(mapVideo),
    },
  };
}

export async function upsertCategory(
  category: Category,
): Promise<{ ok: true; category: Category } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    id: category.id || undefined,
    name: category.name,
    description: category.description,
    color: category.color,
    icon: category.icon,
    image_url: category.imageUrl ?? null,
  };

  const { data, error } = category.id
    ? await supabase.from('categories').update(row).eq('id', category.id).select().single()
    : await supabase.from('categories').insert(row).select().single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Save failed.' };
  return { ok: true, category: mapCategory(data as DbCategory) };
}

export async function deleteCategoryDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertTask(
  task: Task,
): Promise<{ ok: true; task: Task } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    id: task.id || undefined,
    category_id: task.categoryId,
    title: task.title,
    description: task.description,
    min_level: task.minLevel,
    xp_reward: task.xpReward,
    frequency: task.frequency,
    duration_minutes: task.durationMinutes ?? null,
    timer_seconds: task.timerSeconds ?? null,
    open_url: task.openUrl?.trim() || null,
    required_phrase: task.requiredPhrase?.trim() || null,
  };

  const { data, error } = task.id
    ? await supabase.from('tasks').update(row).eq('id', task.id).select().single()
    : await supabase.from('tasks').insert(row).select().single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Save failed.' };
  return { ok: true, task: mapTask(data as DbTask) };
}

export async function deleteTaskDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertReward(
  reward: Reward,
): Promise<{ ok: true; reward: Reward } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = rewardToDb(reward);
  const { data, error } = reward.id
    ? await supabase.from('rewards').update(row).eq('id', reward.id).select().single()
    : await supabase.from('rewards').insert(row).select().single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Save failed.' };
  return { ok: true, reward: mapReward(data as DbReward) };
}

export async function deleteRewardDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('rewards').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertPunishmentTemplate(
  template: PunishmentTemplate,
): Promise<
  { ok: true; template: PunishmentTemplate } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    id: template.id || undefined,
    title: template.title,
    description: template.description,
    trigger_type: template.trigger.type,
    points_lost: template.pointsLost,
  };

  const { data, error } = template.id
    ? await supabase
        .from('punishment_templates')
        .update(row)
        .eq('id', template.id)
        .select()
        .single()
    : await supabase.from('punishment_templates').insert(row).select().single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Save failed.' };
  return { ok: true, template: mapPunishmentTemplate(data as DbPunishmentTemplate) };
}

export async function deletePunishmentTemplateDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('punishment_templates').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertVideoCategory(
  category: VideoCategory,
): Promise<{ ok: true; category: VideoCategory } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    id: category.id || undefined,
    name: category.name,
    description: category.description ?? null,
    color: category.color ?? null,
    icon: category.icon ?? null,
    required_tier: category.requiredTier ?? null,
  };

  const { data, error } = category.id
    ? await supabase
        .from('video_categories')
        .update(row)
        .eq('id', category.id)
        .select()
        .single()
    : await supabase.from('video_categories').insert(row).select().single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Save failed.' };
  return { ok: true, category: mapVideoCategory(data as DbVideoCategory) };
}

export async function deleteVideoCategoryDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('video_categories').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function insertVideoRow(
  video: Video,
): Promise<{ ok: true; video: Video } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    id: video.id || undefined,
    video_category_id: video.categoryId,
    title: video.title,
    description: video.description ?? null,
    storage_path: video.storagePath,
    mime_type: video.mimeType,
    size_bytes: video.sizeBytes,
    required_tier: video.requiredTier ?? 'sweetie',
  };

  const { data, error } = await supabase
    .from('videos')
    .insert(row)
    .select()
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Save failed.' };
  return { ok: true, video: mapVideo(data as DbVideo) };
}

export async function deleteVideoDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('videos').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
