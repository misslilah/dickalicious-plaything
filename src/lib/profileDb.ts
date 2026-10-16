import type { CharacterAppearance } from '../types';
import { isCommunityAdmin } from './adminDirectMessages';
import { getCurrentSession, usernameToEmail } from './auth';
import {
  CHARACTER_MIGRATION_HINT,
  emptyEquipped,
  isCharacterComplete,
  parseEquipped,
  parseCharacterBodySize,
  parseCharacterGender,
} from './characterSprite';
import {
  DEFAULT_BANNER_ID,
  PROFILE_BANNERS,
  ownsBanner,
  parseOwnedBannerIds,
} from './profileBanners';
import { tierRank, type PatreonMemberTier, type PatreonStatus } from './tiers';
import { getSupabase, isSupabaseColumnMissingError } from './supabase';

export const PROFILE_SOCIAL_MIGRATION_HINT =
  'Profile social fields require supabase/migrations/097_profile_social.sql. Run it in the Supabase SQL Editor, then retry.';

export const BIO_MAX_LENGTH = 280;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_BUCKET = 'avatars';
const AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

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
  patreonUpdatedAt: string | null;
  malusPoints: number;
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
  patreon_updated_at?: string | null;
};

type DbAdminListUserRow = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  patreon_user_id: string | null;
  patreon_tier: PatreonMemberTier | null;
  patreon_status: PatreonStatus;
  patreon_updated_at?: string | null;
  malus_points?: number | null;
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
    patreonUpdatedAt: row.patreon_updated_at ?? null,
    malusPoints: 0,
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
    patreonUpdatedAt: row.patreon_updated_at ?? null,
    malusPoints: row.malus_points ?? 0,
  };
}

async function fetchAdminProfilesFromTable(): Promise<FetchAdminProfilesResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const withPatreon = await supabase
    .from('profiles')
    .select('id, username, role, patreon_user_id, patreon_tier, patreon_status, patreon_updated_at')
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

export async function updateProfileCharacter(
  userId: string,
  appearance: CharacterAppearance,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isCharacterComplete(appearance)) {
    return { ok: false, error: 'Pick a gender and a size to confirm.' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('profiles')
    .update({
      character_gender: appearance.gender,
      character_breast_size:
        appearance.gender === 'female' ? appearance.breastSize : null,
      character_penis_size:
        appearance.gender === 'male' ? appearance.penisSize : null,
      character_equipped: appearance.equipped ?? emptyEquipped(),
    })
    .eq('id', userId);

  if (error) {
    if (isSupabaseColumnMissingError(error)) {
      return { ok: false, error: CHARACTER_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type PublicProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  bannerId: string;
  characterGender: CharacterAppearance['gender'] | null;
  characterBreastSize: CharacterAppearance['breastSize'];
  characterPenisSize: CharacterAppearance['penisSize'];
  characterEquipped: CharacterAppearance['equipped'];
  lastSeenAt: string | null;
  currentLevel: number | null;
  totalXp: number | null;
  streak: number | null;
  badgeIds: string[];
};

type PublicProfileRpcRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  banner_id: string | null;
  character_gender: string | null;
  character_breast_size: string | null;
  character_penis_size: string | null;
  character_equipped: unknown;
  last_seen_at: string | null;
  current_level: number | null;
  total_xp: number | null;
  streak: number | null;
  badge_ids: string[] | null;
};

function mapPublicProfile(row: PublicProfileRpcRow): PublicProfile {
  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url?.trim() || null,
    bio: row.bio ?? '',
    bannerId: row.banner_id?.trim() || DEFAULT_BANNER_ID,
    characterGender: parseCharacterGender(row.character_gender),
    characterBreastSize: parseCharacterBodySize(row.character_breast_size),
    characterPenisSize: parseCharacterBodySize(row.character_penis_size),
    characterEquipped: parseEquipped(row.character_equipped),
    lastSeenAt: row.last_seen_at,
    currentLevel: row.current_level,
    totalXp: row.total_xp,
    streak: row.streak,
    badgeIds: (row.badge_ids ?? []).filter(Boolean),
  };
}

export async function fetchPublicProfile(
  lookup: string,
): Promise<{ ok: true; profile: PublicProfile } | { ok: false; error: string }> {
  const trimmed = lookup.trim();
  if (!trimmed) return { ok: false, error: 'Profile not found.' };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const rpc = await supabase.rpc('get_public_profile', { p_lookup: trimmed });
  if (!rpc.error) {
    const rows = (rpc.data ?? []) as PublicProfileRpcRow[];
    if (rows.length === 0) return { ok: false, error: 'Profile not found.' };
    return { ok: true, profile: mapPublicProfile(rows[0]) };
  }

  const missingRpc =
    rpc.error.code === 'PGRST202' ||
    rpc.error.code === '42883' ||
    /get_public_profile/i.test(rpc.error.message ?? '') ||
    /function.*does not exist/i.test(rpc.error.message ?? '');

  if (!missingRpc) {
    if (isSupabaseColumnMissingError(rpc.error)) {
      return { ok: false, error: PROFILE_SOCIAL_MIGRATION_HINT };
    }
    return { ok: false, error: rpc.error.message };
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trimmed,
    );
  const query = supabase
    .from('profiles')
    .select(
      'id, username, avatar_url, bio, banner_id, character_gender, character_breast_size, character_penis_size, character_equipped, last_seen_at',
    );
  const fallback = isUuid
    ? await query.eq('id', trimmed).maybeSingle()
    : await query.ilike('username', trimmed).maybeSingle();

  if (fallback.error) {
    if (isSupabaseColumnMissingError(fallback.error)) {
      return { ok: false, error: PROFILE_SOCIAL_MIGRATION_HINT };
    }
    return { ok: false, error: fallback.error.message };
  }
  if (!fallback.data) return { ok: false, error: 'Profile not found.' };

  const row = fallback.data as PublicProfileRpcRow;
  const badges = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', row.id);

  return {
    ok: true,
    profile: mapPublicProfile({
      ...row,
      current_level: null,
      total_xp: null,
      streak: null,
      badge_ids: ((badges.data ?? []) as { badge_id: string }[]).map(
        (b) => b.badge_id,
      ),
    }),
  };
}

export async function updateProfileBio(
  userId: string,
  bio: string,
): Promise<{ ok: true; bio: string } | { ok: false; error: string }> {
  const next = bio.trim();
  if (next.length > BIO_MAX_LENGTH) {
    return { ok: false, error: `Bio must be ${BIO_MAX_LENGTH} characters or fewer.` };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('profiles')
    .update({ bio: next })
    .eq('id', userId);

  if (error) {
    if (isSupabaseColumnMissingError(error)) {
      return { ok: false, error: PROFILE_SOCIAL_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, bio: next };
}

export async function updateProfileBanner(
  userId: string,
  bannerId: string,
  ownedBannerIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ownsBanner(ownedBannerIds, bannerId)) {
    return { ok: false, error: 'You do not own this banner yet.' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('profiles')
    .update({ banner_id: bannerId })
    .eq('id', userId);

  if (error) {
    if (isSupabaseColumnMissingError(error)) {
      return { ok: false, error: PROFILE_SOCIAL_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function purchaseProfileBanner(
  userId: string,
  bannerId: string,
  ownedBannerIds: string[],
  currentPoints: number,
): Promise<
  | { ok: true; ownedBannerIds: string[]; pointsRemaining: number }
  | { ok: false; error: string }
> {
  const banner = PROFILE_BANNERS.find((item) => item.id === bannerId);
  if (!banner) return { ok: false, error: 'Banner not found.' };
  if (ownsBanner(ownedBannerIds, bannerId)) {
    return { ok: true, ownedBannerIds, pointsRemaining: currentPoints };
  }
  if (banner.pricePoints <= 0) {
    return { ok: true, ownedBannerIds, pointsRemaining: currentPoints };
  }
  if (currentPoints < banner.pricePoints) {
    return { ok: false, error: 'Not enough points.' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const nextPoints = currentPoints - banner.pricePoints;
  const { data, error: pointsError } = await supabase
    .from('user_progress')
    .update({ points: nextPoints })
    .eq('user_id', userId)
    .gte('points', banner.pricePoints)
    .select('points')
    .maybeSingle();

  if (pointsError) return { ok: false, error: pointsError.message };
  if (!data) return { ok: false, error: 'Not enough points.' };

  const nextOwned = parseOwnedBannerIds([...ownedBannerIds, bannerId]);
  const { error } = await supabase
    .from('profiles')
    .update({
      owned_banner_ids: nextOwned,
      banner_id: bannerId,
    })
    .eq('id', userId);

  if (error) {
    if (isSupabaseColumnMissingError(error)) {
      return { ok: false, error: PROFILE_SOCIAL_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    ownedBannerIds: nextOwned,
    pointsRemaining: (data as { points: number }).points,
  };
}

function avatarExtension(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
}

export async function uploadProfileAvatar(
  userId: string,
  file: File,
): Promise<{ ok: true; avatarUrl: string } | { ok: false; error: string }> {
  if (!AVATAR_MIME_TYPES.has(file.type)) {
    return { ok: false, error: 'Use a JPEG, PNG, WebP, or GIF image.' };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      error: 'Keep the photo under 2 MB.',
    };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const path = `${userId}/avatar.${avatarExtension(file)}`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    if (/bucket|not found|avatars/i.test(uploadError.message)) {
      return { ok: false, error: PROFILE_SOCIAL_MIGRATION_HINT };
    }
    return { ok: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);

  if (error) {
    if (isSupabaseColumnMissingError(error)) {
      return { ok: false, error: PROFILE_SOCIAL_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, avatarUrl };
}
