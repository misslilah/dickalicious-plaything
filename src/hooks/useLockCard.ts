import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  fetchActiveLockCards,
  fetchActiveLockForUser,
  type LockCard,
} from '../lib/lockCardDb';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

function mapRow(row: Record<string, unknown>): LockCard | null {
  if (!row?.id || !row.user_id) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    phrase: String(row.phrase ?? ''),
    requiredCount: Number(row.required_count ?? 1),
    completedCount: Number(row.completed_count ?? 0),
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at ?? ''),
    clearedAt: row.cleared_at ? String(row.cleared_at) : null,
    active: Boolean(row.active),
  };
}

/** Active lock card for the signed-in user (realtime + refetch on focus). */
export function useUserLockCard(userId: string | undefined) {
  const [lockCard, setLockCard] = useState<LockCard | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));

  const refresh = useCallback(async () => {
    if (!userId) {
      setLockCard(null);
      setLoading(false);
      return;
    }
    const result = await fetchActiveLockForUser(userId);
    if (result.ok) {
      setLockCard(result.lockCard);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) {
      setLockCard(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refresh();

    const supabase = getSupabase();
    if (!supabase) return;

    let channel: RealtimeChannel | null = supabase
      .channel(`lock-card-user:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_lock_cards',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setLockCard(null);
            return;
          }
          const row = mapRow(payload.new as Record<string, unknown>);
          if (row?.active) {
            setLockCard(row);
          } else {
            setLockCard(null);
          }
        },
      )
      .subscribe();

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [userId, refresh]);

  return { lockCard, loading, refresh };
}

/** All active lock cards for admin dashboard. */
export function useAdminLockCards(enabled: boolean) {
  const [lockCards, setLockCards] = useState<LockCard[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLockCards([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    const result = await fetchActiveLockCards();
    setLoading(false);
    if (result.ok) {
      setLockCards(result.lockCards);
      setError('');
    } else {
      setError(result.error);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured()) {
      setLockCards([]);
      setLoading(false);
      return;
    }

    void refresh();

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel('lock-cards-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_lock_cards' },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { lockCards, loading, error, refresh };
}
