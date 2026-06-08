import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ADMIN_DM_SEND_COOLDOWN_MS,
  fetchAdminDirectInbox,
  fetchAdminDirectThread,
  fetchOwnAdminDirectMessages,
  markAdminDirectThreadRead,
  sendAdminDirectMessage,
  sendAdminDirectReply,
  type AdminDirectMessage,
} from '../lib/adminDirectMessages';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

export type AdminDirectMessagesMode = 'own' | 'inbox' | 'thread';

type UseAdminDirectMessagesArgs = {
  mode: AdminDirectMessagesMode;
  userId: string | undefined;
  username: string | undefined;
  threadUserId?: string;
  enabled: boolean;
  markReadOnThread?: boolean;
};

export function useAdminDirectMessages({
  mode,
  userId,
  username,
  threadUserId,
  enabled,
  markReadOnThread = false,
}: UseAdminDirectMessagesArgs) {
  const [messages, setMessages] = useState<AdminDirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const lastSentAtRef = useRef(0);
  const markedThreadReadRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (mode === 'thread' && !threadUserId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const result =
      mode === 'inbox'
        ? await fetchAdminDirectInbox()
        : mode === 'thread'
          ? await fetchAdminDirectThread(threadUserId!)
          : await fetchOwnAdminDirectMessages(userId);

    if (result.ok) {
      setMessages(result.messages);
    } else {
      setError(result.error);
      setMessages([]);
    }
    setLoading(false);
  }, [enabled, mode, threadUserId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !userId || !isSupabaseConfigured()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const filter =
      mode === 'own'
        ? `user_id=eq.${userId}`
        : mode === 'thread' && threadUserId
          ? `user_id=eq.${threadUserId}`
          : undefined;

    const channelRef = supabase
      .channel(`admin-dm:${mode}:${userId}:${threadUserId ?? 'all'}`)
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
          if (mode === 'thread' && next.userId !== threadUserId) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === next.id)) return prev;
            return [...prev, next];
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admin_direct_messages',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            read_at?: string | null;
          };
          if (!row?.id) return;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id ? { ...m, readAt: row.read_at ?? m.readAt } : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channelRef);
    };
  }, [enabled, mode, threadUserId, userId]);

  useEffect(() => {
    if (
      !markReadOnThread ||
      mode !== 'thread' ||
      !threadUserId ||
      !enabled ||
      loading
    ) {
      return;
    }

    if (markedThreadReadRef.current === threadUserId) return;
    markedThreadReadRef.current = threadUserId;

    void markAdminDirectThreadRead(threadUserId).then((result) => {
      if (result.ok) {
        const readAt = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) =>
            !m.fromAdmin && !m.readAt ? { ...m, readAt } : m,
          ),
        );
      }
    });
  }, [enabled, loading, markReadOnThread, messages, mode, threadUserId]);

  useEffect(() => {
    if (mode !== 'thread') {
      markedThreadReadRef.current = null;
    }
  }, [mode, threadUserId]);

  const send = useCallback(
    async (body: string) => {
      const now = Date.now();
      if (now - lastSentAtRef.current < ADMIN_DM_SEND_COOLDOWN_MS) {
        return {
          ok: false as const,
          error: 'Please wait a moment before sending again.',
        };
      }

      if (mode === 'thread') {
        if (!threadUserId) {
          return { ok: false as const, error: 'Select a conversation first.' };
        }

        setSending(true);
        const result = await sendAdminDirectReply(threadUserId, body);
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
      }

      if (mode !== 'own' || !userId || !username) {
        return { ok: false as const, error: 'You must be signed in to send a message.' };
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
    [mode, threadUserId, userId, username],
  );

  return { messages, loading, error, sending, send, refresh };
}
