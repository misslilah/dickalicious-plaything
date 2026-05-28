import type { PatreonMemberTier, PatreonStatus } from './tiers';
import { getSupabase, isSupabaseColumnMissingError } from './supabase';

export interface PatreonProfile {
  patreonUserId: string | null;
  patreonTier: PatreonMemberTier | null;
  patreonStatus: PatreonStatus;
  patreonUpdatedAt: string | null;
}

export interface AdminProfileRow {
  id: string;
  username: string;
  role: string;
  patreonTier: PatreonMemberTier | null;
  patreonStatus: PatreonStatus;
  patreonUserId: string | null;
}

type DbProfilePatreon = {
  patreon_user_id: string | null;
  patreon_tier: PatreonMemberTier | null;
  patreon_status: PatreonStatus;
  patreon_updated_at: string | null;
};

type DbAdminProfileRow = {
  id: string;
  username: string;
  role: string;
  patreon_user_id?: string | null;
  patreon_tier?: PatreonMemberTier | null;
  patreon_status?: PatreonStatus;
};

export async function fetchPatreonProfile(
  userId: string,
): Promise<{ ok: true; profile: PatreonProfile } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  let { data, error } = await supabase
    .from('profiles')
    .select('patreon_user_id, patreon_tier, patreon_status, patreon_updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error && isSupabaseColumnMissingError(error)) {
    return {
      ok: true,
      profile: {
        patreonUserId: null,
        patreonTier: null,
        patreonStatus: 'none',
        patreonUpdatedAt: null,
      },
    };
  }

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Profile not found.' };
  }

  const row = data as DbProfilePatreon;
  return {
    ok: true,
    profile: {
      patreonUserId: row.patreon_user_id,
      patreonTier: row.patreon_tier,
      patreonStatus: row.patreon_status ?? 'none',
      patreonUpdatedAt: row.patreon_updated_at,
    },
  };
}

export async function fetchAdminProfiles(): Promise<
  { ok: true; profiles: AdminProfileRow[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const withPatreon = await supabase
    .from('profiles')
    .select('id, username, role, patreon_user_id, patreon_tier, patreon_status')
    .order('username');

  let data = withPatreon.data as DbAdminProfileRow[] | null;
  let error = withPatreon.error;

  if (error && isSupabaseColumnMissingError(error)) {
    const base = await supabase
      .from('profiles')
      .select('id, username, role')
      .order('username');
    data = (base.data ?? []) as DbAdminProfileRow[];
    error = base.error;
  }

  if (error) return { ok: false, error: error.message };

  const profiles = (data ?? []).map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    patreonUserId: row.patreon_user_id ?? null,
    patreonTier: row.patreon_tier ?? null,
    patreonStatus: row.patreon_status ?? 'none',
  }));

  return { ok: true, profiles };
}

export async function updateProfilePatreon(
  userId: string,
  patreonTier: PatreonMemberTier | null,
  patreonStatus: PatreonStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('profiles')
    .update({
      patreon_tier: patreonTier,
      patreon_status: patreonStatus,
      patreon_updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface OnlineProfileRow {
  id: string;
  username: string;
  lastSeenAt: string;
}

type DbOnlineProfileRow = {
  id: string;
  username: string;
  last_seen_at: string;
};

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export async function updateProfileLastSeen(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);

  if (error && isSupabaseColumnMissingError(error)) {
    return { ok: true };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchOnlineProfiles(): Promise<
  { ok: true; profiles: OnlineProfileRow[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, last_seen_at')
    .gt('last_seen_at', since)
    .order('username');

  if (error && isSupabaseColumnMissingError(error)) {
    return { ok: true, profiles: [] };
  }
  if (error) return { ok: false, error: error.message };

  const profiles = ((data ?? []) as DbOnlineProfileRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    lastSeenAt: row.last_seen_at,
  }));

  return { ok: true, profiles };
}

export async function updateProfileUsername(
  userId: string,
  username: string,
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const trimmed = username.trim();
  if (!trimmed) return { ok: false, error: 'Username is required.' };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('profiles')
    .update({ username: trimmed })
    .eq('id', userId);

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'That username is already taken.' };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, username: trimmed };
}
