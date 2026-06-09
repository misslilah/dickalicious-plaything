import type { Punishment } from '../types';
import { getSupabase } from './supabase';
import {
  formatPunishmentCooldown,
  type PunishmentCooldownEntry,
} from './punishmentCooldown';

const MIGRATION_HINT =
  'Punishment cooldown is not set up yet. In Supabase SQL Editor, run supabase/migrations/067_punishment_cooldown.sql, then retry.';

type RpcCooldownRow = {
  template_id?: string;
  available_at?: string;
  remaining_seconds?: number;
};

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    message.includes('punishment_completions') ||
    message.includes('get_punishment_cooldowns') ||
    message.includes('complete_punishment')
  ) {
    return MIGRATION_HINT;
  }
  return message;
}

function mapCooldownRows(rows: RpcCooldownRow[] | null | undefined): PunishmentCooldownEntry[] {
  const entries: PunishmentCooldownEntry[] = [];
  for (const row of rows ?? []) {
    if (!row.template_id || !row.available_at) continue;
    const availableAtMs = new Date(row.available_at).getTime();
    if (!Number.isFinite(availableAtMs)) continue;
    entries.push({ templateId: row.template_id, availableAtMs });
  }
  return entries;
}

export async function fetchPunishmentCooldowns(): Promise<
  | { ok: true; cooldowns: PunishmentCooldownEntry[] }
  | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('get_punishment_cooldowns');
  if (error) return { ok: false, error: formatDbError(error) };

  const payload = data as {
    ok?: boolean;
    error?: string;
    cooldowns?: RpcCooldownRow[];
  } | null;

  if (!payload?.ok) {
    return { ok: false, error: payload?.error ?? 'Could not load punishment cooldowns.' };
  }

  return { ok: true, cooldowns: mapCooldownRows(payload.cooldowns) };
}

export async function completePunishmentDb(
  templateId: string,
): Promise<
  | {
      ok: true;
      malusPoints: number;
      malusRelieved: number;
      punishment: Punishment;
    }
  | { ok: false; error: string; remainingMs?: number }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('complete_punishment', {
    p_template_id: templateId,
  });
  if (error) return { ok: false, error: formatDbError(error) };

  const payload = data as {
    ok?: boolean;
    error?: string;
    malus_points?: number;
    malus_relieved?: number;
    punishment?: Punishment;
    available_at?: string;
    remaining_seconds?: number;
  } | null;

  if (!payload?.ok) {
    if (payload?.error === 'cooldown_active') {
      const remainingMs =
        typeof payload.remaining_seconds === 'number'
          ? payload.remaining_seconds * 1000
          : payload.available_at
            ? Math.max(0, new Date(payload.available_at).getTime() - Date.now())
            : undefined;
      const error =
        remainingMs != null && remainingMs > 0
          ? `You can do this punishment again in ${formatPunishmentCooldown(remainingMs).replace(/^Available in /, '')}.`
          : 'You can do this punishment again later.';
      return {
        ok: false,
        error,
        remainingMs,
      };
    }
    return { ok: false, error: payload?.error ?? 'Could not complete punishment.' };
  }

  const malusPoints = payload.malus_points;
  const punishment = payload.punishment;
  if (typeof malusPoints !== 'number' || !punishment) {
    return { ok: false, error: 'Punishment completed but response was incomplete.' };
  }

  return {
    ok: true,
    malusPoints,
    malusRelieved: payload.malus_relieved ?? 0,
    punishment,
  };
}
