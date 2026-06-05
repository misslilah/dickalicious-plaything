import { isCommunityAdmin } from './adminDirectMessages';
import { getCurrentSession, usernameToEmail } from './auth';
import { tierRank, type PatreonMemberTier, type PatreonStatus } from './tiers';
import { getSupabase, isSupabaseColumnMissingError } from './supabase';

export const ADMIN_LIST_USERS_MIGRATION_HINT =
  'User emails require supabase/migrations/059_admin_list_users.sql. Run it in the Supabase SQL Editor, then refresh this page.';

export interface PatreonProfile {
  patreonUserId: string | null;
  patreonTier: PatreonMemberTier | null;
  patreonStatus: PatreonStatus;
  patreonUpdatedAt: string | null;
}

export interface AdminProfileRow {
  id: string;
  username: string;
  email: string | null;
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
  email?: string | null;
  role: string;
  patreon_user_id?: string | null;
  patreon_tier?: PatreonMemberTier | null;
  patreon_status?: PatreonStatus;
};

type DbAdminListUserRow = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  patreon_user_id: string | null;
  patreon_tier: PatreonMemberTier | null;
  patreon_status: PatreonStatus;
};

export type FetchAdminProfilesResult =
  | { ok: true; profiles: AdminProfileRow[]; emailsFromAuth: boolean }
  | { ok: false; error: string };

/** Email for admin user lists (auth email, or username@local.app when unavailable). */
export function displayAdminUserEmail(
  profile: Pick<AdminProfileRow, 'email' | 'username'>,
): string {
  const email = profile.email?.trim();
  if (email) return email;
  const username = profile.username?.trim();
  if (username) return usernameToEmail(username);
  return '—';
}

export type AdminUserTierFilter = 'all' | 'none' | PatreonMemberTier;

export const ADMIN_USER_TIER_FILTER_OPTIONS: { value: AdminUserTierFilter; label: string }[] =
  [
    { value: 'all', label: 'All' },
    { value: 'none', label: 'None' },
    { value: 'sweetie', label: 'Sweetie' },
    { value: 'princess', label: 'Princess' },
    { value: 'slut', label: 'Slut' },
  ];

export function matchesAdminUserTierFilter(
  profile: Pick<AdminProfileRow, 'patreonTier'>,
  filter: AdminUserTierFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return profile.patreonTier == null;
  return profile.patreonTier === filter;
}

function adminProfileListTierRank(profile: Pick<AdminProfileRow, 'patreonTier'>): number {
  return profile.patreonTier ? tierRank(profile.patreonTier) : 0;
}

export function filterAndSortAdminProfiles(
  profiles: AdminProfileRow[],
  filter: AdminUserTierFilter,
): AdminProfileRow[] {
  const filtered = profiles.filter((p) => matchesAdminUserTierFilter(p, filter));
  return [...filtered].sort((a, b) => {
    const rankDiff = adminProfileListTierRank(a) - adminProfileListTierRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
  });
}

export type AdminUserTierCounts = Record<AdminUserTierFilter, number>;

export function countAdminProfilesByTier(profiles: AdminProfileRow[]): AdminUserTierCounts {
  const counts: AdminUserTierCounts = {
    all: profiles.length,
    none: 0,
    sweetie: 0,
    princess: 0,
    slut: 0,
  };
  for (const p of profiles) {
    const tier = p.patreonTier;
    if (tier == null) counts.none++;
    else counts[tier]++;
  }
  return counts;
}

function mapAdminProfileRow(row: DbAdminProfileRow): AdminProfileRow {
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    role: row.role,
    patreonUserId: row.patreon_user_id ?? null,
    patreonTier: row.patreon_tier ?? null,
    patreonStatus: row.patreon_status ?? 'none',
  };
}

function mapAdminListUserRow(row: DbAdminListUserRow): AdminProfileRow {
  return {
    id: row.id,
    username: row.username,
    email: typeof row.email === 'string' ? row.email : null,
    role: row.role,
    patreonUserId: row.patreon_user_id ?? null,
    patreonTier: row.patreon_tier ?? null,
    patreonStatus: row.patreon_status ?? 'none',
  };
}

async function fetchAdminProfilesFromTable(): Promise<FetchAdminProfilesResult> {
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

  return {
    ok: true,
    profiles: (data ?? []).map(mapAdminProfileRow),
    emailsFromAuth: false,
  };
}

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

export async function fetchAdminProfiles(): Promise<FetchAdminProfilesResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('admin_list_users');

  if (error) {
    const missingRpc =
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /admin_list_users/i.test(error.message ?? '') ||
      /function.*does not exist/i.test(error.message ?? '');
    if (missingRpc) {
      return fetchAdminProfilesFromTable();
    }
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as DbAdminListUserRow[];
  if (rows.length === 0) {
    const fallback = await fetchAdminProfilesFromTable();
    if (fallback.ok && fallback.profiles.length > 0) {
      return fallback;
    }
  }

  return {
    ok: true,
    profiles: rows.map(mapAdminListUserRow),
    emailsFromAuth: true,
  };
}

export async function updateProfilePatreon(
  userId: string,
  patreonTier: PatreonMemberTier | null,
  patreonStatus: PatreonStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  if (!isCommunityAdmin(session)) {
    return { ok: false, error: 'Admin access required.' };
  }

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
