import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ADMIN_DM_SEND_COOLDOWN_MS,
  fetchAdminDirectInbox,
  fetchOwnAdminDirectMessages,
  markAdminDirectMessageRead,
  sendAdminDirectMessage,
  type AdminDirectMessage,
} from '../lib/adminDirectMessages';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

export type AdminDirectMessagesMode = 'own' | 'inbox';

type UseAdminDirectMessagesArgs = {
  mode: AdminDirectMessagesMode;
  userId: string | undefined;
  username: string | undefined;
  enabled: boolean;
  markReadOnInbox?: boolean;
};

export function useAdminDirectMessages({
  mode,
  userId,
  username,
  enabled,
  markReadOnInbox = false,
}: UseAdminDirectMessagesArgs) {
  const [messages, setMessages] = useState<AdminDirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const lastSentAtRef = useRef(0);
  const markedReadRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!enabled || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const result =
      mode === 'inbox'
        ? await fetchAdminDirectInbox()
        : await fetchOwnAdminDirectMessages(userId);

    if (result.ok) {
      setMessages(result.messages);
    } else {
      setError(result.error);
      setMessages([]);
    }
    setLoading(false);
  }, [enabled, mode, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !userId || !isSupabaseConfigured()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const filter =
      mode === 'own' ? `user_id=eq.${userId}` : undefined;

    const channelRef = supabase
      .channel(`admin-dm:${mode}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_direct_messages',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            user_id?: string;
            username?: string;
            body?: string;
            created_at?: string;
            read_at?: string | null;
            from_admin?: boolean;
          };
          if (!row?.id) return;

          const next: AdminDirectMessage = {
            id: String(row.id),
            userId: String(row.user_id ?? ''),
            username: String(row.username ?? 'User'),
            body: String(row.body ?? ''),
            createdAt: String(row.created_at ?? new Date().toISOString()),
            readAt: row.read_at ?? null,
            fromAdmin: row.from_admin === true,
          };

          if (mode === 'own' && next.userId !== userId) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channelRef);
    };
  }, [enabled, mode, userId]);

  useEffect(() => {
    if (!markReadOnInbox || mode !== 'inbox' || !enabled || loading) return;

    for (const msg of messages) {
      if (msg.readAt || markedReadRef.current.has(msg.id)) continue;
      markedReadRef.current.add(msg.id);
      void markAdminDirectMessageRead(msg.id).then((result) => {
        if (result.ok) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msg.id
                ? { ...m, readAt: m.readAt ?? new Date().toISOString() }
                : m,
            ),
          );
        }
      });
    }
  }, [enabled, loading, markReadOnInbox, messages, mode]);

  const send = useCallback(
    async (body: string) => {
      if (mode !== 'own' || !userId || !username) {
        return { ok: false as const, error: 'You must be signed in to send a message.' };
      }

      const now = Date.now();
      if (now - lastSentAtRef.current < ADMIN_DM_SEND_COOLDOWN_MS) {
        return {
          ok: false as const,
          error: 'Please wait a moment before sending again.',
        };
      }

      setSending(true);
      const result = await sendAdminDirectMessage(userId, username, body);
      setSending(false);

      if (result.ok) {
        lastSentAtRef.current = now;
        setMessages((prev) => {
          if (prev.some((m) => m.id === result.message.id)) return prev;
          return [...prev, result.message];
        });
        return { ok: true as const };
      }
      return { ok: false as const, error: result.error };
    },
    [mode, userId, username],
  );

  return { messages, loading, error, sending, send, refresh };
}
