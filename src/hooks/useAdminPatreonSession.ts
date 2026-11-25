import { useCallback, useEffect, useState } from 'react';
import {
  ADMIN_PATREON_SESSION_INTERVAL_MS,
  formatPatreonSyncSummary,
  patreonSyncStatusMessage,
  probePatreonSync,
  readAdminPatreonLastSyncIso,
  syncAllPatreonMembersDeduped,
} from '../lib/patreonSync';

export type AdminPatreonSyncPhase =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'unconfigured';

export type AdminPatreonSyncValue = {
  phase: AdminPatreonSyncPhase;
  message: string;
  error: string;
  configHint: string;
  lastSyncedAt: string | null;
  syncNow: () => void;
};

/**
 * Batch-sync linked Patreon members for the whole time Admin stays open.
 * There is no server cron from the browser: closing Admin pauses sync until the next visit.
 */
export function useAdminPatreonSession(): AdminPatreonSyncValue {
  const [phase, setPhase] = useState<AdminPatreonSyncPhase>('idle');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [configHint, setConfigHint] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    readAdminPatreonLastSyncIso(),
  );

  const run = useCallback(async (force: boolean) => {
    setPhase('syncing');
    setError('');
    setConfigHint('');
    setMessage('Syncing linked Patreon members…');

    const probe = await probePatreonSync();
    if (!probe.ok) {
      setPhase('unconfigured');
      setConfigHint(
        patreonSyncStatusMessage(probe) ?? 'Patreon sync is not available.',
      );
      setMessage('');
      return;
    }

    const result = await syncAllPatreonMembersDeduped({ force });
    const iso = readAdminPatreonLastSyncIso();
    if (iso) setLastSyncedAt(iso);

    if (!result.ok) {
      setPhase('error');
      setError(result.error);
      setMessage('');
      return;
    }

    setPhase('success');
    setMessage(formatPatreonSyncSummary(result));
  }, []);

  useEffect(() => {
    void run(false);
    const id = window.setInterval(() => {
      void run(true);
    }, ADMIN_PATREON_SESSION_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [run]);

  const syncNow = useCallback(() => {
    void run(true);
  }, [run]);

  return { phase, message, error, configHint, lastSyncedAt, syncNow };
}
