import type { Badge, BadgeRequirement } from '../types';
import { getSupabase } from './supabase';

type DbBadge = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  is_secret: boolean;
  sort_order: number;
  requirement_type: 'task' | 'category' | 'bubble_pops' | null;
  task_id: string | null;
  category_id: string | null;
  duration_seconds: number | null;
  min_bubble_pops: number | null;
};

type DbUserBadge = {
  badge_id: string;
};

function mapRequirement(row: DbBadge): BadgeRequirement | null {
  if (!row.requirement_type) return null;
  if (row.requirement_type === 'task' && row.task_id) {
    return {
      type: 'task',
      taskId: row.task_id,
      durationSeconds: row.duration_seconds ?? undefined,
    };
  }
  if (row.requirement_type === 'category' && row.category_id) {
    return {
      type: 'category',
      categoryId: row.category_id,
      durationSeconds: row.duration_seconds ?? undefined,
    };
  }
  if (row.requirement_type === 'bubble_pops' && row.min_bubble_pops) {
    return {
      type: 'bubble_pops',
      minBubblePops: row.min_bubble_pops,
    };
  }
  return null;
}

function mapBadge(row: DbBadge): Badge {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url ?? undefined,
    isSecret: row.is_secret,
    sortOrder: row.sort_order,
    requirement: mapRequirement(row),
  };
}

const BADGES_MIGRATION_HINT =
  'Profile badges are not set up yet. In Supabase SQL Editor, run supabase/migrations/016_badges.sql (or 017_badges_fix.sql), then 042_badge_unlock_requirements.sql and 047_bubble_pop_badge_unlocks.sql for auto-unlock rules.';

function formatBadgeDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.badges'") ||
    message.includes("Could not find the table 'public.user_badges'") ||
    message.includes("Could not find the table 'public.user_badge_progress'")
  ) {
    return BADGES_MIGRATION_HINT;
  }
  return message;
}

function requirementToDb(requirement: BadgeRequirement | null | undefined): {
  requirement_type: 'task' | 'category' | 'bubble_pops' | null;
  task_id: string | null;
  category_id: string | null;
  duration_seconds: number | null;
  min_bubble_pops: number | null;
} {
  if (!requirement) {
    return {
      requirement_type: null,
      task_id: null,
      category_id: null,
      duration_seconds: null,
      min_bubble_pops: null,
    };
  }

  const durationSeconds =
    requirement.durationSeconds != null && requirement.durationSeconds > 0
      ? requirement.durationSeconds
      : null;

  if (requirement.type === 'task') {
    return {
      requirement_type: 'task',
      task_id: requirement.taskId ?? null,
      category_id: null,
      duration_seconds: durationSeconds,
      min_bubble_pops: null,
    };
  }

  if (requirement.type === 'bubble_pops') {
    const minPops =
      requirement.minBubblePops != null && requirement.minBubblePops > 0
        ? Math.floor(requirement.minBubblePops)
        : null;
    return {
      requirement_type: 'bubble_pops',
      task_id: null,
      category_id: null,
      duration_seconds: null,
      min_bubble_pops: minPops,
    };
  }

  return {
    requirement_type: 'category',
    task_id: null,
    category_id: requirement.categoryId ?? null,
    duration_seconds: durationSeconds,
    min_bubble_pops: null,
  };
}

function badgeToDb(badge: Badge): Omit<DbBadge, 'id'> & { id?: string } {
  const req = requirementToDb(badge.requirement);
  return {
    id: badge.id || undefined,
    title: badge.title,
    description: badge.description,
    image_url: badge.imageUrl ?? null,
    is_secret: badge.isSecret,
    sort_order: badge.sortOrder,
    ...req,
  };
}

export async function fetchBadges(): Promise<
  { ok: true; badges: Badge[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .order('sort_order')
    .order('created_at');

  if (error) return { ok: false, error: formatBadgeDbError(error) };
  return { ok: true, badges: (data as DbBadge[]).map(mapBadge) };
}

export async function fetchUserBadgeIds(
  userId: string,
): Promise<{ ok: true; badgeIds: string[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', userId);

  if (error) return { ok: false, error: formatBadgeDbError(error) };
  return {
    ok: true,
    badgeIds: (data as DbUserBadge[]).map((row) => row.badge_id),
  };
}

export async function upsertBadge(
  badge: Badge,
  mode: 'insert' | 'update',
): Promise<{ ok: true; badge: Badge } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const row = badgeToDb(badge);

  if (mode === 'update') {
    if (!badge.id) {
      return { ok: false, error: 'Badge id is required for update.' };
    }
    const { data, error } = await supabase
      .from('badges')
      .update(row)
      .eq('id', badge.id)
      .select('*')
      .maybeSingle();
    if (error) return { ok: false, error: formatBadgeDbError(error) };
    if (!data) {
      return {
        ok: false,
        error: 'Badge not found or update returned no row.',
      };
    }
    return { ok: true, badge: mapBadge(data as DbBadge) };
  }

  const insertRow = {
    ...row,
    id: badge.id || undefined,
  };
  const { data, error } = await supabase
    .from('badges')
    .insert(insertRow)
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error ? formatBadgeDbError(error) : 'Save failed.' };
  }
  return { ok: true, badge: mapBadge(data as DbBadge) };
}

export async function deleteBadgeDb(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.from('badges').delete().eq('id', id);
  if (error) return { ok: false, error: formatBadgeDbError(error) };
  return { ok: true };
}

export async function unlockBadgeForUser(
  userId: string,
  badgeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.from('user_badges').upsert({
    user_id: userId,
    badge_id: badgeId,
  });

  if (error) return { ok: false, error: formatBadgeDbError(error) };
  return { ok: true };
}
