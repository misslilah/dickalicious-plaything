import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityChannel } from '../lib/communityChannels';
import {
  COMMUNITY_SEND_COOLDOWN_MS,
  fetchCommunityMessages,
  sendCommunityMessage,
  type CommunityMessage,
} from '../lib/communityChat';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

type UseCommunityChatArgs = {
  channel: CommunityChannel;
  userId: string | undefined;
  username: string | undefined;
  canPost: boolean;
};

export function useCommunityChat({
  channel,
  userId,
  username,
  canPost,
}: UseCommunityChatArgs) {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const lastSentAtRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const result = await fetchCommunityMessages(channel);
    if (result.ok) {
      setMessages(result.messages);
    } else {
      setError(result.error);
      setMessages([]);
    }
    setLoading(false);
  }, [channel, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const channelRef = supabase
      .channel(`community-chat:${channel}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
          filter: `channel=eq.${channel}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            channel?: string;
            user_id?: string;
            username?: string;
            body?: string;
            created_at?: string;
          };
          if (!row?.id || row.channel !== channel) return;
          const next: CommunityMessage = {
            id: String(row.id),
            channel,
            userId: String(row.user_id ?? ''),
            username: String(row.username ?? 'User'),
            body: String(row.body ?? ''),
            createdAt: String(row.created_at ?? new Date().toISOString()),
          };
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
  }, [channel, userId]);

  const send = useCallback(
    async (body: string) => {
      if (!userId || !username || !canPost) {
        return { ok: false as const, error: 'You cannot post in this channel.' };
      }
      const now = Date.now();
      if (now - lastSentAtRef.current < COMMUNITY_SEND_COOLDOWN_MS) {
        return { ok: false as const, error: 'Please wait a moment before sending again.' };
      }

      setSending(true);
      const result = await sendCommunityMessage(channel, userId, username, body);
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
    [canPost, channel, userId, username],
  );

  return { messages, loading, error, sending, send, refresh };
}
