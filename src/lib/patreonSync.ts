import { getSupabase, normalizeSupabaseUrl } from './supabase';

export type PatreonSyncUserResult = {
  userId: string;
  username: string;
  patreonUserId: string;
  previousTier: string | null;
  previousStatus: string;
  tier: string | null;
  status: string;
  changed: boolean;
  lastSynced: string;
  error?: string;
};

export type PatreonSyncResult =
  | {
      ok: true;
      synced: number;
      updated: number;
      unchanged: number;
      errors: { userId: string; username: string; error: string }[];
      results: PatreonSyncUserResult[];
    }
  | { ok: false; error: string; missing?: string[]; hint?: string };

type EdgeFunctionErrorBody = {
  error?: string;
  message?: string;
  missing?: string[];
  hint?: string;
};

async function readEdgeFunctionError(
  response: Response | undefined,
  fallbackMessage: string,
): Promise<{ error: string; missing?: string[]; hint?: string }> {
  if (!response) return { error: fallbackMessage };

  try {
    const body = (await response.clone().json()) as EdgeFunctionErrorBody;
    const message =
      (typeof body.error === 'string' && body.error.trim()) ||
      (typeof body.message === 'string' && body.message.trim()) ||
      fallbackMessage;
    const hint = typeof body.hint === 'string' && body.hint.trim() ? body.hint.trim() : undefined;
    const missing = Array.isArray(body.missing)
      ? body.missing.filter((name): name is string => typeof name === 'string' && name.length > 0)
      : undefined;
    return {
      error: hint ? `${message} ${hint}` : message,
      missing,
      hint,
    };
  } catch {
    return { error: fallbackMessage };
  }
}

export type PatreonSyncProbeResult =
  | { ok: true }
  | { ok: false; missing: string[]; error?: string };

/** Probe whether patreon-sync-members is configured (admin GET). */
export async function probePatreonSync(): Promise<PatreonSyncProbeResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, missing: [], error: 'Supabase is not configured.' };
  }

  const { data, error, response } = await supabase.functions.invoke('patreon-sync-members', {
    method: 'GET',
  });

  if (error) {
    if (response?.status === 404) {
      return {
        ok: false,
        missing: [],
        error:
          'patreon-sync-members is not deployed. Run: supabase functions deploy patreon-sync-members',
      };
    }
    const parsed = await readEdgeFunctionError(response, 'Could not probe Patreon sync.');
    return { ok: false, missing: parsed.missing ?? [], error: parsed.error };
  }

  const payload = data as { ok?: boolean; missing?: string[] } | null;
  if (payload?.ok === true) return { ok: true };

  const missing = Array.isArray(payload?.missing)
    ? payload.missing.filter((name): name is string => typeof name === 'string')
    : [];
  return { ok: false, missing };
}

export function patreonSyncStatusMessage(
  probe: PatreonSyncProbeResult,
): string | null {
  if (probe.ok) return null;
  if (probe.error && !probe.missing.length) return probe.error;
  if (probe.missing.length > 0) {
    return `Patreon sync secrets missing: ${probe.missing.join(', ')}. Add them in Supabase Dashboard → Edge Functions → Secrets, then redeploy patreon-sync-members. Creator token needs campaigns + campaigns.members scopes.`;
  }
  return probe.error ?? 'Patreon sync is not available.';
}

/** Admin-only: sync one linked user or all linked users when userId is omitted. */
export async function syncPatreonMembers(
  userId?: string | null,
): Promise<PatreonSyncResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const body = userId?.trim() ? { userId: userId.trim() } : {};
  const { data, error, response } = await supabase.functions.invoke('patreon-sync-members', {
    body,
  });

  if (error) {
    const generic =
      error.message === 'Edge Function returned a non-2xx status code'
        ? 'Patreon sync failed.'
        : error.message || 'Patreon sync failed.';
    const parsed = await readEdgeFunctionError(response, generic);
    return {
      ok: false,
      error: parsed.error,
      missing: parsed.missing,
      hint: parsed.hint,
    };
  }

  const payload = data as
    | {
        ok?: boolean;
        error?: string;
        missing?: string[];
        hint?: string;
        synced?: number;
        updated?: number;
        unchanged?: number;
        errors?: { userId: string; username: string; error: string }[];
        results?: PatreonSyncUserResult[];
      }
    | null;

  if (!payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? 'Patreon sync failed.',
      missing: payload?.missing,
      hint: payload?.hint,
    };
  }

  return {
    ok: true,
    synced: payload.synced ?? 0,
    updated: payload.updated ?? 0,
    unchanged: payload.unchanged ?? 0,
    errors: payload.errors ?? [],
    results: payload.results ?? [],
  };
}

export function getPatreonSyncFunctionUrl(): string | null {
  const raw = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!raw?.trim()) return null;
  return `${normalizeSupabaseUrl(raw)}/functions/v1/patreon-sync-members`;
}

export function formatPatreonSyncSummary(result: Extract<PatreonSyncResult, { ok: true }>): string {
  const parts = [
    `Synced ${result.synced} linked account${result.synced === 1 ? '' : 's'}.`,
    `${result.updated} updated.`,
  ];
  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} error${result.errors.length === 1 ? '' : 's'}.`);
  }
  return parts.join(' ');
}

export function formatPatreonLastSynced(iso: string | null | undefined): string {
  if (!iso) return 'never synced';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function patreonStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'None';
  }
}

/** localStorage ISO timestamp of the last successful admin batch Patreon sync. */
export const ADMIN_PATREON_LAST_SYNC_STORAGE_KEY = 'admin-patreon-last-sync';

/** Skip Admin → Users auto-sync when a successful batch sync ran within this window. */
export const ADMIN_PATREON_AUTO_SYNC_THROTTLE_MS = 20 * 60 * 1000;

export type AdminPatreonAutoSyncOutcome =
  | { kind: 'unconfigured'; probe: PatreonSyncProbeResult }
  | { kind: 'skipped'; lastSyncedAt: number }
  | { kind: 'synced'; result: Extract<PatreonSyncResult, { ok: true }> }
  | { kind: 'failed'; result: Extract<PatreonSyncResult, { ok: false }> };

function readLastSuccessfulPatreonSyncAt(): number | null {
  try {
    const raw = localStorage.getItem(ADMIN_PATREON_LAST_SYNC_STORAGE_KEY);
    if (!raw) return null;
    const timestamp = Date.parse(raw);
    return Number.isNaN(timestamp) ? null : timestamp;
  } catch {
    return null;
  }
}

/** Record a successful batch (all linked users) sync for the auto-sync throttle. */
export function markAdminPatreonBatchSyncSucceeded(at = Date.now()): void {
  try {
    localStorage.setItem(ADMIN_PATREON_LAST_SYNC_STORAGE_KEY, new Date(at).toISOString());
  } catch {
    // Ignore quota / private-mode failures; the next visit may auto-sync again.
  }
}

export function formatPatreonAutoSyncSkippedMessage(lastSyncedAt: number): string {
  const when = formatPatreonLastSynced(new Date(lastSyncedAt).toISOString());
  return `Patreon tiers already synced (${when}) — skipped auto-sync. Use Sync Patreon tiers to refresh.`;
}

let adminPatreonAutoSyncInFlight: Promise<AdminPatreonAutoSyncOutcome> | null = null;
let adminPatreonAutoSyncBatchStarted = false;
const adminPatreonAutoSyncStartListeners: Array<() => void> = [];

/**
 * Probe then optionally batch-sync Patreon members when Admin → Users mounts.
 * Dedupes overlapping calls (React Strict Mode). Does not retry on missing secrets.
 */
export function runAdminPatreonAutoSync(
  onBatchSyncStart?: () => void,
): Promise<AdminPatreonAutoSyncOutcome> {
  if (onBatchSyncStart) {
    if (adminPatreonAutoSyncBatchStarted) onBatchSyncStart();
    else adminPatreonAutoSyncStartListeners.push(onBatchSyncStart);
  }

  if (adminPatreonAutoSyncInFlight) return adminPatreonAutoSyncInFlight;

  const pending = (async (): Promise<AdminPatreonAutoSyncOutcome> => {
    try {
      const probe = await probePatreonSync();
      if (!probe.ok) return { kind: 'unconfigured', probe };

      const lastSyncedAt = readLastSuccessfulPatreonSyncAt();
      if (
        lastSyncedAt != null &&
        Date.now() - lastSyncedAt < ADMIN_PATREON_AUTO_SYNC_THROTTLE_MS
      ) {
        return { kind: 'skipped', lastSyncedAt };
      }

      adminPatreonAutoSyncBatchStarted = true;
      const startListeners = adminPatreonAutoSyncStartListeners.splice(0);
      for (const listener of startListeners) listener();

      const result = await syncPatreonMembers();
      if (!result.ok) return { kind: 'failed', result };

      markAdminPatreonBatchSyncSucceeded();
      return { kind: 'synced', result };
    } finally {
      adminPatreonAutoSyncStartListeners.length = 0;
      adminPatreonAutoSyncBatchStarted = false;
    }
  })();

  adminPatreonAutoSyncInFlight = pending;
  void pending.finally(() => {
    if (adminPatreonAutoSyncInFlight === pending) {
      adminPatreonAutoSyncInFlight = null;
    }
  });
  return pending;
}
