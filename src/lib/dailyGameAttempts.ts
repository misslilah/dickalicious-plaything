import type { PatreonMemberTier, PatreonStatus } from '../types';
import { getSupabase } from './supabase';

export type DailyGameType = 'flash_cards' | 'follow_instinct' | 'puzzle';

const MIGRATION_HINT =
  'Daily game attempt limits are not set up yet. In Supabase SQL Editor, run supabase/migrations/064_daily_game_attempts.sql, then retry.';

export interface DailyGameAttemptStatus {
  ok: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  canPlay: boolean;
  error?: 'patreon_required' | 'daily_limit_reached';
}

type RpcStatusRow = {
  ok?: boolean;
  used?: number;
  limit?: number | null;
  remaining?: number | null;
  unlimited?: boolean;
  can_play?: boolean;
  error?: string;
};

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    message.includes('daily_game_attempts') ||
    message.includes('start_mini_game_attempt') ||
    message.includes('get_daily_game_attempt_status')
  ) {
    return MIGRATION_HINT;
  }
  return message;
}

function mapStatusRow(row: RpcStatusRow | null): DailyGameAttemptStatus {
  const used = typeof row?.used === 'number' ? row.used : 0;
  const unlimited = row?.unlimited === true;
  const limit = unlimited ? null : (typeof row?.limit === 'number' ? row.limit : 0);
  const remaining = unlimited
    ? null
    : typeof row?.remaining === 'number'
      ? row.remaining
      : Math.max((limit ?? 0) - used, 0);
  const canPlay = row?.can_play ?? (unlimited || used < (limit ?? 0));
  const error =
    row?.error === 'patreon_required' || row?.error === 'daily_limit_reached'
      ? row.error
      : undefined;

  return {
    ok: row?.ok !== false,
    used,
    limit,
    remaining,
    unlimited,
    canPlay,
    error,
  };
}

/** Client-side mirror of server limits (for display only; enforcement is server-side). */
export function dailyMiniGameLimit(
  tier: PatreonMemberTier | null | undefined,
  status: PatreonStatus | null | undefined,
  isAdmin?: boolean,
): number | null {
  if (isAdmin) return null;
  if (status !== 'active' || !tier) return 0;
  switch (tier) {
    case 'sweetie':
      return 3;
    case 'princess':
      return 15;
    case 'slut':
      return null;
    default:
      return 0;
  }
}

export function dailyGameAttemptRemainingLabel(status: DailyGameAttemptStatus): string | null {
  if (status.unlimited) return 'Unlimited plays today';
  if (status.limit === 0) return null;
  const limit = status.limit!;
  const remaining =
    status.remaining ?? Math.max(limit - status.used, 0);
  if (remaining === 1) return `1 of ${limit} play left today`;
  return `${remaining} of ${limit} plays left today`;
}

/** Subtle upgrade hint for tiered users who still have plays remaining. */
export function dailyGameAttemptShouldShowUpgradeHint(status: DailyGameAttemptStatus): boolean {
  if (status.unlimited || status.limit === 0 || !status.canPlay) return false;
  return status.limit === 3 || status.limit === 15;
}

export function dailyGameAttemptBlockedMessage(status: DailyGameAttemptStatus): string {
  if (status.error === 'patreon_required' || status.limit === 0) {
    return 'Mini games require an active Patreon membership. Connect Patreon in Settings to play.';
  }
  if (!status.canPlay && status.limit != null && status.limit > 0) {
    const used = status.used;
    const limit = status.limit;
    if (limit === 3) {
      return `Daily limit reached (${used}/${limit}). Upgrade to Princess (15/day) or Slut (unlimited) on Patreon to play more.`;
    }
    if (limit === 15) {
      return `Daily limit reached (${used}/${limit}). Upgrade to Slut on Patreon for unlimited plays.`;
    }
    return `Daily limit reached (${used}/${limit}). Upgrade on Patreon for more plays.`;
  }
  return 'You cannot start a new game session right now.';
}

export async function fetchDailyGameAttemptStatus(
  gameType: DailyGameType,
): Promise<{ ok: true; status: DailyGameAttemptStatus } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('get_daily_game_attempt_status', {
    p_game_type: gameType,
  });

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, status: mapStatusRow(data as RpcStatusRow | null) };
}

export async function startMiniGameAttempt(
  gameType: DailyGameType,
): Promise<{ ok: true; status: DailyGameAttemptStatus } | { ok: false; error: string; status?: DailyGameAttemptStatus }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('start_mini_game_attempt', {
    p_game_type: gameType,
  });

  if (error) return { ok: false, error: formatDbError(error) };

  const status = mapStatusRow(data as RpcStatusRow | null);
  if (!status.ok || !status.canPlay) {
    return {
      ok: false,
      error: dailyGameAttemptBlockedMessage(status),
      status,
    };
  }

  return { ok: true, status };
}

export async function fetchAllDailyGameAttemptStatuses(): Promise<
  | {
      ok: true;
      statuses: Record<DailyGameType, DailyGameAttemptStatus>;
    }
  | { ok: false; error: string }
> {
  const gameTypes: DailyGameType[] = ['flash_cards', 'follow_instinct', 'puzzle'];
  const results = await Promise.all(
    gameTypes.map(async (gameType) => {
      const result = await fetchDailyGameAttemptStatus(gameType);
      return { gameType, result };
    }),
  );

  const statuses = {} as Record<DailyGameType, DailyGameAttemptStatus>;
  const errors: string[] = [];

  for (const { gameType, result } of results) {
    if (result.ok) {
      statuses[gameType] = result.status;
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length === gameTypes.length) {
    return { ok: false, error: errors[0] ?? 'Could not load play limits.' };
  }

  for (const gameType of gameTypes) {
    if (!statuses[gameType]) {
      statuses[gameType] = {
        ok: true,
        used: 0,
        limit: 0,
        remaining: 0,
        unlimited: false,
        canPlay: false,
      };
    }
  }

  return { ok: true, statuses };
}
