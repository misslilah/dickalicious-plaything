import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEMO_PUBLIC_PROFILE_NOTICE,
  DEMO_PUBLIC_PROFILE_USERNAME,
  isDemoPublicProfileId,
} from '../lib/demoPublicProfile';
import {
  USER_DM_SEND_COOLDOWN_MS,
  fetchUserDirectInbox,
  fetchUserDirectThread,
  markUserDirectThreadRead,
  sendUserDirectMessage,
  type UserDirectMessage,
} from '../lib/userDirectMessages';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

export type UserDirectMessagesMode = 'inbox' | 'thread';

type UseUserDirectMessagesArgs = {
  mode: UserDirectMessagesMode;
  userId: string | undefined;
  peerId?: string;
  enabled: boolean;
  markReadOnThread?: boolean;
};

export function useUserDirectMessages({
  mode,
  userId,
  peerId,
  enabled,
  markReadOnThread = false,
}: UseUserDirectMessagesArgs) {
  const [messages, setMessages] = useState<UserDirectMessage[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const lastSentAtRef = useRef(0);
  const markedThreadReadRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) {
      setMessages([]);
      setUsernames({});
      setLoading(false);
      return;
    }

    if (mode === 'thread' && !peerId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (mode === 'thread' && isDemoPublicProfileId(peerId)) {
      setMessages([]);
      setUsernames({ [peerId]: DEMO_PUBLIC_PROFILE_USERNAME });
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    if (mode === 'inbox') {
      const result = await fetchUserDirectInbox(userId);
      if (result.ok) {
        setMessages(result.messages);
        setUsernames(result.usernames);
      } else {
        setError(result.error);
        setMessages([]);
        setUsernames({});
      }
    } else {
      const result = await fetchUserDirectThread(userId, peerId!);
      if (result.ok) {
        setMessages(result.messages);
      } else {
        setError(result.error);
        setMessages([]);
      }
    }

    setLoading(false);
  }, [enabled, mode, peerId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !userId || !isSupabaseConfigured()) return;
    if (mode === 'thread' && isDemoPublicProfileId(peerId)) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const channelRef = supabase
      .channel(`user-dm:${mode}:${userId}:${peerId ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_direct_messages',
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            from_id?: string;
            to_id?: string;
            body?: string;
            created_at?: string;
            read_at?: string | null;
          };
          if (!row?.id || !row.from_id || !row.to_id) return;
          if (row.from_id !== userId && row.to_id !== userId) return;

          if (mode === 'thread' && peerId) {
            const involvesPeer =
              (row.from_id === userId && row.to_id === peerId) ||
              (row.from_id === peerId && row.to_id === userId);
            if (!involvesPeer) return;
          }

          const next: UserDirectMessage = {
            id: String(row.id),
            fromId: String(row.from_id),
            toId: String(row.to_id),
            body: String(row.body ?? ''),
            createdAt: String(row.created_at ?? new Date().toISOString()),
            readAt: row.read_at ?? null,
          };

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
          table: 'user_direct_messages',
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
  }, [enabled, mode, peerId, userId]);

  useEffect(() => {
    if (
      !markReadOnThread ||
      mode !== 'thread' ||
      !peerId ||
      !userId ||
      !enabled ||
      loading ||
      isDemoPublicProfileId(peerId)
    ) {
      return;
    }

    if (markedThreadReadRef.current === peerId) return;
    markedThreadReadRef.current = peerId;

    void markUserDirectThreadRead(userId, peerId).then((result) => {
      if (result.ok) {
        const readAt = new Date().toISOString();
        setMessages((prev) =>
          prev.map((m) =>
            m.toId === userId && !m.readAt ? { ...m, readAt } : m,
          ),
        );
      }
    });
  }, [enabled, loading, markReadOnThread, mode, peerId, userId]);

  useEffect(() => {
    if (mode !== 'thread') {
      markedThreadReadRef.current = null;
    }
  }, [mode, peerId]);

  const send = useCallback(
    async (body: string) => {
      if (!userId || !peerId) {
        return { ok: false as const, error: 'Select a conversation first.' };
      }

      if (isDemoPublicProfileId(peerId)) {
        return { ok: false as const, error: DEMO_PUBLIC_PROFILE_NOTICE };
      }

      const now = Date.now();
      if (now - lastSentAtRef.current < USER_DM_SEND_COOLDOWN_MS) {
        return {
          ok: false as const,
          error: 'Please wait a moment before sending again.',
        };
      }

      setSending(true);
      const result = await sendUserDirectMessage(userId, peerId, body);
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
    [peerId, userId],
  );

  return { messages, usernames, loading, error, sending, send, refresh };
}
