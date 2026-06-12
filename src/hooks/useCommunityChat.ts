import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityChannel } from '../lib/communityChannels';
import {
  COMMUNITY_SEND_COOLDOWN_MS,
  deleteCommunityMessage,
  fetchCommunityMessages,
  sendCommunityMessage,
  toggleCommunityMessageHeart,
  type CommunityMessage,
} from '../lib/communityChat';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

type UseCommunityChatArgs = {
  channel: CommunityChannel;
  userId: string | undefined;
  username: string | undefined;
  canPost: boolean;
  isAdmin?: boolean;
};

function applyHeartChange(
  messages: CommunityMessage[],
  messageId: string,
  reactingUserId: string,
  inserted: boolean,
  currentUserId?: string,
): CommunityMessage[] {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const delta = inserted ? 1 : -1;
    const hearted =
      currentUserId && reactingUserId === currentUserId ? inserted : message.hearted;
    return {
      ...message,
      heartCount: Math.max(0, message.heartCount + delta),
      hearted,
    };
  });
}

export function useCommunityChat({
  channel,
  userId,
  username,
  canPost,
  isAdmin = false,
}: UseCommunityChatArgs) {
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState('');
  const lastSentAtRef = useRef(0);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const refresh = useCallback(async () => {
    if (!userId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const result = await fetchCommunityMessages(channel, userId);
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
            heartCount: 0,
            hearted: false,
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
          event: 'DELETE',
          schema: 'public',
          table: 'community_messages',
        },
        (payload) => {
          const row = payload.old as { id?: string };
          if (!row?.id) return;
          setMessages((prev) => prev.filter((message) => message.id !== row.id));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_message_reactions',
        },
        (payload) => {
          const row = payload.new as {
            message_id?: string;
            user_id?: string;
            reaction?: string;
          };
          if (!row?.message_id || row.reaction !== 'heart') return;
          setMessages((prev) => {
            if (!prev.some((message) => message.id === row.message_id)) return prev;
            return applyHeartChange(
              prev,
              row.message_id!,
              row.user_id ?? '',
              true,
              userIdRef.current,
            );
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'community_message_reactions',
        },
        (payload) => {
          const row = payload.old as {
            message_id?: string;
            user_id?: string;
            reaction?: string;
          };
          if (!row?.message_id || row.reaction !== 'heart') return;
          setMessages((prev) => {
            if (!prev.some((message) => message.id === row.message_id)) return prev;
            return applyHeartChange(
              prev,
              row.message_id!,
              row.user_id ?? '',
              false,
              userIdRef.current,
            );
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

  const removeMessage = useCallback(
    async (messageId: string) => {
      if (!isAdmin) {
        return { ok: false as const, error: 'You do not have permission to delete messages.' };
      }

      setActionError('');
      const result = await deleteCommunityMessage(messageId);
      if (!result.ok) {
        setActionError(result.error);
        return result;
      }

      setMessages((prev) => prev.filter((message) => message.id !== messageId));
      return result;
    },
    [isAdmin],
  );

  const toggleHeart = useCallback(
    async (messageId: string, hearted: boolean) => {
      if (!isAdmin || !userId) {
        return { ok: false as const, error: 'You do not have permission to react to messages.' };
      }

      setActionError('');
      const result = await toggleCommunityMessageHeart(messageId, userId, hearted);
      if (!result.ok) {
        setActionError(result.error);
        return result;
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? { ...message, hearted: result.hearted, heartCount: result.heartCount }
            : message,
        ),
      );
      return result;
    },
    [isAdmin, userId],
  );

  return {
    messages,
    loading,
    error,
    actionError,
    sending,
    send,
    removeMessage,
    toggleHeart,
    refresh,
  };
}
