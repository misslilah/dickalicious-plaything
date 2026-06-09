import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import type { ThroneGiftEvent } from '../types';

export type ThroneGiftToast = {
  id: string;
  message: string;
  matchedUserId: string | null;
};

function formatGiftMessage(event: ThroneGiftEvent): string {
  const gifter = event.gifterName?.trim() || 'Someone';
  const item = event.itemName?.trim();
  const type = event.eventType?.trim().toLowerCase();

  if (type && type !== 'gift' && !item) {
    return `Throne webhook: ${type}`;
  }
  if (item) return `${gifter} sent: ${item}`;
  if (type && type !== 'gift') return `Throne webhook (${type})`;
  return `${gifter} sent a Throne gift!`;
}

/** Subscribe to throne_gift_events inserts for on-site toasts. */
export function useThroneGiftRealtime(
  userId: string | undefined,
  enabled = true,
): { toast: ThroneGiftToast | null; dismissToast: () => void } {
  const [toast, setToast] = useState<ThroneGiftToast | null>(null);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !userId) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`throne-gifts:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'throne_gift_events' },
        (payload) => {
          const row = payload.new as {
            id?: string;
            event_type?: string;
            gifter_name?: string | null;
            item_name?: string | null;
            matched_user_id?: string | null;
          };
          const id = row.id;
          if (!id || seenIds.current.has(id)) return;
          seenIds.current.add(id);

          const event: ThroneGiftEvent = {
            id,
            receivedAt: new Date().toISOString(),
            eventType: row.event_type ?? 'gift',
            gifterName: row.gifter_name ?? null,
            itemName: row.item_name ?? null,
            amountCents: null,
            currency: null,
            matchedUserId: row.matched_user_id ?? null,
            matchedTaskId: null,
          };

          setToast({
            id,
            message: formatGiftMessage(event),
            matchedUserId: row.matched_user_id ?? null,
          });
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Throne gift realtime subscription issue:', status, err?.message);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);

  return {
    toast,
    dismissToast: () => setToast(null),
  };
}
