import type { Badge } from '../types';
import { getSupabase } from './supabase';

type DbBadge = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  is_secret: boolean;
  sort_order: number;
};

type DbUserBadge = {
  badge_id: string;
};

function mapBadge(row: DbBadge): Badge {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url ?? undefined,
    isSecret: row.is_secret,
    sortOrder: row.sort_order,
  };
}

const BADGES_MIGRATION_HINT =
  'Profile badges are not set up yet. In Supabase SQL Editor, run supabase/migrations/016_badges.sql (or 017_badges_fix.sql), then wait a minute or reload the project under Settings → API.';

function formatBadgeDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.badges'") ||
    message.includes("Could not find the table 'public.user_badges'")
  ) {
    return BADGES_MIGRATION_HINT;
  }
  return message;
}

function badgeToDb(badge: Badge): Omit<DbBadge, 'id'> & { id?: string } {
  return {
    id: badge.id || undefined,
    title: badge.title,
    description: badge.description,
    image_url: badge.imageUrl ?? null,
    is_secret: badge.isSecret,
    sort_order: badge.sortOrder,
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
