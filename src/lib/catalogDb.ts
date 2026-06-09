import type { TaskUserStage, UserStage } from './levels';
import type {
  Badge,
  Category,
  ContentTier,
  PunishmentCategory,
  PunishmentDifficulty,
  PunishmentTemplate,
  PunishmentTrigger,
  Reward,
  RewardTrigger,
  Task,
  TaskFrequency,
  TaskScope,
  Video,
  VideoCategory,
} from '../types';
import { fetchBadges } from './badgeDb';
import { getSupabase } from './supabase';

export interface SharedCatalog {
  categories: Category[];
  tasks: Task[];
  rewards: Reward[];
  badges: Badge[];
  punishmentCategories: PunishmentCategory[];
  punishmentTemplates: PunishmentTemplate[];
  videoCategories: VideoCategory[];
  videoCategoryCounts: Record<string, number>;
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
  required_stage: UserStage | null;
  category_group: Category['categoryGroup'] | null;
  unlock_after_category_id: string | null;
};

type DbTask = {
  id: string;
  category_id: string | null;
  task_scope: TaskScope;
  assigned_user_id: string | null;
  title: string;
  description: string;
  user_stage: TaskUserStage;
  xp_reward: number;
  frequency: TaskFrequency;
  duration_minutes: number | null;
  timer_seconds: number | null;
  duration_seconds: number | null;
  open_url: string | null;
  required_phrase: string | null;
  required_phrase_repeat_count: number;
  malus_points_on_fail: number;
  points_reward: number;
  linked_media_type: string;
  linked_video_id: string | null;
  linked_audio_item_id: string | null;
  linked_audio_url: string | null;
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

type DbPunishmentCategory = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  difficulty: string | null;
  image_url: string | null;
};

type DbPunishmentTemplate = {
  id: string;
  title: string;
  description: string;
  trigger_type: PunishmentTrigger['type'];
  points_lost: number;
  difficulty: PunishmentDifficulty | null;
  malus_points_relieved: number;
  punishment_category_id: string | null;
  required_phrases: string[] | null;
  required_phrase_repeat_count: number | null;
  timer_seconds: number | null;
  open_url: string | null;
};

type DbVideoCategory = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  required_tier: ContentTier | null;
  sort_order: number;
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
  auto_loop?: boolean | null;
  xp_reward?: number | null;
  shop_points_cost?: number | null;
  duration_seconds?: number | null;
};

function mapCategory(row: DbCategory): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    imageUrl: row.image_url ?? undefined,
    requiredStage: row.required_stage ?? null,
    categoryGroup: row.category_group ?? 'beginner',
    unlockAfterCategoryId: row.unlock_after_category_id ?? null,
  };
}

function mapTask(row: DbTask): Task {
  const taskScope = row.task_scope ?? 'category';
  return {
    id: row.id,
    taskScope,
    categoryId: row.category_id ?? null,
    assignedUserId: row.assigned_user_id ?? null,
    title: row.title,
    description: row.description,
    userStage: row.user_stage ?? 'any',
    xpReward: row.xp_reward,
    frequency: row.frequency,
    durationMinutes: row.duration_minutes ?? undefined,
    timerSeconds: row.timer_seconds ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    openUrl: row.open_url ?? undefined,
    requiredPhrase: row.required_phrase?.trim() || undefined,
    requiredPhraseRepeatCount: row.required_phrase?.trim()
      ? Math.max(1, row.required_phrase_repeat_count ?? 1)
      : 1,
    malusPointsOnFail: row.malus_points_on_fail ?? 0,
    pointsReward: row.points_reward ?? 0,
    linkedMediaType:
      row.linked_media_type === 'video' || row.linked_media_type === 'audio'
        ? row.linked_media_type
        : 'none',
    linkedVideoId: row.linked_video_id ?? undefined,
    linkedAudioItemId: row.linked_audio_item_id ?? undefined,
    linkedAudioUrl: row.linked_audio_url?.trim() || undefined,
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

function mapPunishmentCategory(row: DbPunishmentCategory): PunishmentCategory {
  const difficultyRaw = row.difficulty?.toLowerCase();
  const difficulty =
    difficultyRaw === 'easy' || difficultyRaw === 'medium' || difficultyRaw === 'hard'
      ? difficultyRaw
      : undefined;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sortOrder: row.sort_order ?? 0,
    difficulty,
    imageUrl: row.image_url ?? undefined,
  };
}

function normalizeRequiredPhrases(raw: string[] | null | undefined): string[] {
  if (!raw?.length) return [];
  return raw.map((p) => p.trim()).filter(Boolean);
}

function mapPunishmentTemplate(row: DbPunishmentTemplate): PunishmentTemplate {
  const triggerType = row.trigger_type;
  const trigger: PunishmentTrigger =
    triggerType === 'malus_relief'
      ? { type: 'malus_relief' }
      : ({ type: triggerType } as PunishmentTrigger);
  const requiredPhrases = normalizeRequiredPhrases(row.required_phrases);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    trigger,
    categoryId: row.punishment_category_id ?? null,
    difficulty: row.difficulty ?? undefined,
    malusPointsRelieved: row.malus_points_relieved ?? row.points_lost ?? 0,
    pointsLost: row.points_lost,
    requiredPhrases: requiredPhrases.length > 0 ? requiredPhrases : undefined,
    requiredPhraseRepeatCount: requiredPhrases.length
      ? Math.max(1, row.required_phrase_repeat_count ?? 1)
      : undefined,
    timerSeconds: row.timer_seconds ?? undefined,
    openUrl: row.open_url?.trim() || undefined,
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
    sortOrder: row.sort_order ?? 0,
  };
}

async function nextVideoCategorySortOrder(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data } = await supabase
    .from('video_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { sort_order: number } | null;
  return (row?.sort_order ?? -1) + 1;
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
    autoLoop: row.auto_loop ?? false,
    xpReward: row.xp_reward ?? 0,
    shopPointsCost: row.shop_points_cost ?? null,
    durationSeconds: row.duration_seconds ?? null,
  };
}

type DbVideoCategoryCount = {
  category_id: string;
  video_count: number;
};

async function fetchVideoCategoryCounts(): Promise<
  { ok: true; counts: Record<string, number> } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase.rpc('get_video_category_counts');
  if (error) return { ok: false, error: error.message };

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as DbVideoCategoryCount[]) {
    counts[row.category_id] = Number(row.video_count);
  }
  return { ok: true, counts };
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
    badgesResult,
    punishmentCategoriesRes,
    punishmentsRes,
    videoCategoriesRes,
    videosRes,
    videoCategoryCountsResult,
  ] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('rewards').select('*').order('created_at'),
    fetchBadges(),
    supabase.from('punishment_categories').select('*').order('sort_order'),
    supabase.from('punishment_templates').select('*').order('created_at'),
    supabase.from('video_categories').select('*').order('sort_order'),
    supabase.from('videos').select('*').order('created_at', { ascending: false }),
    fetchVideoCategoryCounts(),
  ]);

  if (!badgesResult.ok) {
    return { ok: false, error: badgesResult.error };
  }

  if (!videoCategoryCountsResult.ok) {
    return { ok: false, error: videoCategoryCountsResult.error };
  }

  const firstError =
    categoriesRes.error ??
    tasksRes.error ??
    rewardsRes.error ??
    punishmentCategoriesRes.error ??
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
      badges: badgesResult.badges,
      punishmentCategories: (punishmentCategoriesRes.data as DbPunishmentCategory[]).map(
        mapPunishmentCategory,
      ),
      punishmentTemplates: (punishmentsRes.data as DbPunishmentTemplate[]).map(
        mapPunishmentTemplate,
      ),
      videoCategories: (videoCategoriesRes.data as DbVideoCategory[]).map(
        mapVideoCategory,
      ),
      videoCategoryCounts: videoCategoryCountsResult.counts,
      videos: (videosRes.data as DbVideo[]).map(mapVideo),
    },
  };
}

export async function upsertCategory(
  category: Category,
  mode: 'insert' | 'update',
): Promise<{ ok: true; category: Category } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    name: category.name,
    description: category.description,
    color: category.color,
    icon: category.icon,
    image_url: category.imageUrl ?? null,
    required_stage: category.requiredStage ?? null,
    category_group: category.categoryGroup ?? 'beginner',
    unlock_after_category_id: category.unlockAfterCategoryId ?? null,
  };

  if (mode === 'update') {
    if (!category.id) {
      return { ok: false, error: 'Category id is required for update.' };
    }
    const { data, error } = await supabase
      .from('categories')
      .update(row)
      .eq('id', category.id)
      .select('*')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) {
      return {
        ok: false,
        error: 'Category not found or update returned no row.',
      };
    }
    return { ok: true, category: mapCategory(data as DbCategory) };
  }

  const insertRow = {
    ...row,
    id: category.id || undefined,
  };
  const { data, error } = await supabase
    .from('categories')
    .insert(insertRow)
    .select('*')
    .single();

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

  const taskScope = task.taskScope ?? 'category';
  const requiredPhrase = task.requiredPhrase?.trim() || null;
  const row = {
    id: task.id || undefined,
    task_scope: taskScope,
    category_id: taskScope === 'category' ? task.categoryId ?? null : null,
    ...(taskScope === 'custom'
      ? { assigned_user_id: task.assignedUserId ?? null }
      : {}),
    title: task.title,
    description: task.description,
    user_stage: task.userStage ?? 'any',
    xp_reward: task.xpReward,
    frequency: task.frequency,
    duration_minutes: task.durationMinutes ?? null,
    timer_seconds: task.timerSeconds ?? null,
    duration_seconds: task.durationSeconds ?? null,
    open_url: task.openUrl?.trim() || null,
    required_phrase: requiredPhrase,
    required_phrase_repeat_count: requiredPhrase
      ? Math.max(1, task.requiredPhraseRepeatCount ?? 1)
      : 1,
    malus_points_on_fail: task.malusPointsOnFail ?? 0,
    points_reward: task.pointsReward ?? 0,
    linked_media_type: task.linkedMediaType ?? 'none',
    linked_video_id:
      task.linkedMediaType === 'video' ? task.linkedVideoId ?? null : null,
    linked_audio_item_id:
      task.linkedMediaType === 'audio' ? task.linkedAudioItemId ?? null : null,
    linked_audio_url:
      task.linkedMediaType === 'audio'
        ? task.linkedAudioUrl?.trim() || null
        : null,
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

  const requiredPhrases = normalizeRequiredPhrases(template.requiredPhrases);
  const openUrl = template.openUrl?.trim() || null;
  if (openUrl && !/^https?:\/\//i.test(openUrl)) {
    return { ok: false, error: 'Open URL must start with http:// or https://.' };
  }

  const row = {
    id: template.id || undefined,
    title: template.title,
    description: template.description,
    trigger_type: template.trigger.type,
    points_lost: template.pointsLost ?? 0,
    difficulty: template.difficulty ?? 'medium',
    malus_points_relieved: template.malusPointsRelieved ?? 0,
    punishment_category_id: template.categoryId || null,
    required_phrases: requiredPhrases,
    required_phrase_repeat_count: requiredPhrases.length
      ? Math.max(1, template.requiredPhraseRepeatCount ?? 1)
      : 1,
    timer_seconds:
      template.timerSeconds != null && template.timerSeconds > 0
        ? template.timerSeconds
        : null,
    open_url: openUrl,
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

export async function upsertPunishmentCategory(
  category: PunishmentCategory,
  mode: 'insert' | 'update',
): Promise<
  { ok: true; category: PunishmentCategory } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = {
    name: category.name,
    description: category.description ?? null,
    sort_order: category.sortOrder ?? 0,
    difficulty: category.difficulty ?? 'medium',
    image_url: category.imageUrl ?? null,
  };

  if (mode === 'update') {
    if (!category.id) {
      return { ok: false, error: 'Category id is required for update.' };
    }
    const { data, error } = await supabase
      .from('punishment_categories')
      .update(row)
      .eq('id', category.id)
      .select('*')
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) {
      return {
        ok: false,
        error: 'Category not found or update returned no row.',
      };
    }
    return { ok: true, category: mapPunishmentCategory(data as DbPunishmentCategory) };
  }

  const insertRow = {
    ...row,
    id: category.id || undefined,
  };
  const { data, error } = await supabase
    .from('punishment_categories')
    .insert(insertRow)
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Save failed.' };
  return { ok: true, category: mapPunishmentCategory(data as DbPunishmentCategory) };
}

export async function deletePunishmentCategoryDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('punishment_categories').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertVideoCategory(
  category: VideoCategory,
): Promise<{ ok: true; category: VideoCategory } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const isUpdate = Boolean(category.id);
  const row = {
    id: category.id || undefined,
    name: category.name,
    description: category.description ?? null,
    color: category.color ?? null,
    icon: category.icon ?? null,
    required_tier: category.requiredTier ?? null,
    ...(isUpdate
      ? { sort_order: category.sortOrder ?? 0 }
      : { sort_order: category.sortOrder ?? (await nextVideoCategorySortOrder()) }),
  };

  const { data, error } = isUpdate
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

export async function updateVideoCategoriesOrder(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('video_categories')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);
    if (error) return { ok: false, error: error.message };
  }
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
    auto_loop: video.autoLoop ?? false,
    xp_reward: video.xpReward ?? 0,
    shop_points_cost: video.shopPointsCost ?? null,
    duration_seconds: video.durationSeconds ?? null,
  };

  const { data, error } = await supabase
    .from('videos')
    .insert(row)
    .select()
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Save failed.' };
  return { ok: true, video: mapVideo(data as DbVideo) };
}

export async function updateVideoRow(
  video: Video,
): Promise<{ ok: true; video: Video } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  if (!video.id) return { ok: false, error: 'Video id is required.' };

  const { data, error } = await supabase
    .from('videos')
    .update({
      video_category_id: video.categoryId,
      title: video.title,
      description: video.description ?? null,
      required_tier: video.requiredTier ?? 'sweetie',
      auto_loop: video.autoLoop ?? false,
      xp_reward: video.xpReward ?? 0,
      shop_points_cost: video.shopPointsCost ?? null,
      duration_seconds: video.durationSeconds ?? null,
    })
    .eq('id', video.id)
    .select()
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Update failed.' };
  return { ok: true, video: mapVideo(data as DbVideo) };
}

export async function updateVideoDuration(
  id: string,
  durationSeconds: number,
): Promise<{ ok: true; video: Video } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ok: false, error: 'Duration must be a positive number of seconds.' };
  }

  const { data, error } = await supabase
    .from('videos')
    .update({ duration_seconds: Math.round(durationSeconds) })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Update failed.' };
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
