import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityChannel } from '../lib/communityChannels';
import {
  fetchAdminDirectInbox,
  type AdminDirectMessage,
} from '../lib/adminDirectMessages';
import {
  COMMUNITY_UNREAD_CHANNEL_VIEWS,
  emptyUnreadCounts,
  getLastReadTimestamps,
  markCommunityViewRead,
  truncateMessagePreview,
  type CommunityUnreadView,
} from '../lib/communityChatUnread';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

export type CommunityChatView = CommunityChannel | 'admin-contact' | 'admin-inbox';

type UseCommunityChatUnreadArgs = {
  userId: string | undefined;
  isAdmin: boolean;
  open: boolean;
  activeView: CommunityChatView;
  adminThreadUserId?: string | null;
};

export type AdminDmToastState = {
  preview: string;
} | null;

const ADMIN_DM_TOAST_MS = 4500;

export function useCommunityChatUnread({
  userId,
  isAdmin,
  open,
  activeView,
  adminThreadUserId = null,
}: UseCommunityChatUnreadArgs) {
  const [unreadByView, setUnreadByView] =
    useState<Record<CommunityUnreadView, number>>(emptyUnreadCounts);
  const [adminDmToast, setAdminDmToast] = useState<AdminDmToastState>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastQueueRef = useRef<string[]>([]);
  const openRef = useRef(open);
  const activeViewRef = useRef(activeView);
  const adminThreadUserIdRef = useRef(adminThreadUserId);

  openRef.current = open;
  activeViewRef.current = activeView;
  adminThreadUserIdRef.current = adminThreadUserId;

  const advanceAdminDmToast = useCallback(() => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    const nextPreview = toastQueueRef.current.shift();
    if (!nextPreview) {
      setAdminDmToast(null);
      return;
    }
    setAdminDmToast({ preview: nextPreview });
    toastTimerRef.current = window.setTimeout(advanceAdminDmToast, ADMIN_DM_TOAST_MS);
  }, []);

  const dismissAdminDmToast = useCallback(() => {
    advanceAdminDmToast();
  }, [advanceAdminDmToast]);

  const queueAdminDmToast = useCallback(
    (body: string) => {
      const preview = truncateMessagePreview(body);
      if (adminDmToast == null && toastTimerRef.current == null) {
        setAdminDmToast({ preview });
        toastTimerRef.current = window.setTimeout(advanceAdminDmToast, ADMIN_DM_TOAST_MS);
        return;
      }
      toastQueueRef.current.push(preview);
    },
    [adminDmToast, advanceAdminDmToast],
  );

  const isViewActive = useCallback((view: CommunityUnreadView): boolean => {
    return openRef.current && activeViewRef.current === view;
  }, []);

  const incrementUnread = useCallback((view: CommunityUnreadView) => {
    setUnreadByView((prev) => ({
      ...prev,
      [view]: prev[view] + 1,
    }));
  }, []);

  const refreshUnreadCounts = useCallback(async () => {
    if (!userId || !isSupabaseConfigured()) {
      setUnreadByView(emptyUnreadCounts());
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setUnreadByView(emptyUnreadCounts());
      return;
    }

    const lastRead = getLastReadTimestamps(userId);
    const next = emptyUnreadCounts();

    await Promise.all(
      COMMUNITY_UNREAD_CHANNEL_VIEWS.map(async (channel) => {
        const since = lastRead[channel];
        if (!since) {
          next[channel] = 0;
          return;
        }

        const { count, error } = await supabase
          .from('community_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel', channel)
          .neq('user_id', userId)
          .gt('created_at', since);

        if (!error) {
          next[channel] = count ?? 0;
        }
      }),
    );

    const adminContactSince = lastRead['admin-contact'];
    if (adminContactSince) {
      const adminContactResult = await supabase
        .from('admin_direct_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('from_admin', true)
        .gt('created_at', adminContactSince);

      if (!adminContactResult.error) {
        next['admin-contact'] = adminContactResult.count ?? 0;
      }
    }

    if (isAdmin) {
      const inboxResult = await fetchAdminDirectInbox();
      if (inboxResult.ok) {
        next['admin-contact'] = inboxResult.messages.filter(
          (msg) => !msg.fromAdmin && !msg.readAt,
        ).length;
      }
    }

    setUnreadByView(next);
  }, [isAdmin, userId]);

  useEffect(() => {
    void refreshUnreadCounts();
  }, [refreshUnreadCounts]);

  useEffect(() => {
    if (!userId || !open) return;

    // Admins clear DM unread per thread when opening a member thread, not on tab open.
    if (isAdmin && activeView === 'admin-contact') return;

    markCommunityViewRead(userId, activeView);
    setUnreadByView((prev) => ({
      ...prev,
      [activeView]: 0,
    }));
  }, [activeView, isAdmin, open, userId]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const handleCommunityInsert = (channel: CommunityChannel) => (payload: { new: unknown }) => {
      const row = payload.new as {
        id?: string;
        user_id?: string;
        body?: string;
        created_at?: string;
      };
      if (!row?.id || row.user_id === userId) return;
      if (isViewActive(channel)) return;
      incrementUnread(channel);
    };

    const handleOwnAdminDmInsert = (payload: { new: unknown }) => {
      const row = payload.new as {
        id?: string;
        user_id?: string;
        body?: string;
        from_admin?: boolean;
      };
      if (!row?.id || row.user_id !== userId) return;
      if (!row.from_admin) return;
      if (isViewActive('admin-contact')) return;

      incrementUnread('admin-contact');
      if (row.body) {
        queueAdminDmToast(row.body);
      }
    };

    const handleAdminInboxInsert = (payload: { new: unknown }) => {
      const row = payload.new as {
        id?: string;
        user_id?: string;
        from_admin?: boolean;
        read_at?: string | null;
      };
      if (!row?.id || row.from_admin) return;
      if (row.read_at) return;

      const viewingThread =
        openRef.current &&
        activeViewRef.current === 'admin-contact' &&
        adminThreadUserIdRef.current === row.user_id;
      if (viewingThread) return;

      incrementUnread('admin-contact');
    };

    const handleAdminInboxUpdate = (payload: { new: unknown; old: unknown }) => {
      const nextRow = payload.new as { read_at?: string | null; from_admin?: boolean };
      const prevRow = payload.old as { read_at?: string | null; from_admin?: boolean };
      if (nextRow.from_admin || prevRow.from_admin) return;
      if (nextRow.read_at && !prevRow.read_at) {
        setUnreadByView((prev) => ({
          ...prev,
          'admin-contact': Math.max(0, prev['admin-contact'] - 1),
        }));
      }
    };

    const channelRef = supabase.channel(`community-unread:${userId}`);

    for (const channel of COMMUNITY_UNREAD_CHANNEL_VIEWS) {
      channelRef.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
          filter: `channel=eq.${channel}`,
        },
        handleCommunityInsert(channel),
      );
    }

    channelRef.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'admin_direct_messages',
        filter: `user_id=eq.${userId}`,
      },
      handleOwnAdminDmInsert,
    );

    if (isAdmin) {
      channelRef.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_direct_messages',
        },
        handleAdminInboxInsert,
      );
      channelRef.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admin_direct_messages',
        },
        handleAdminInboxUpdate,
      );
    }

    channelRef.subscribe();

    return () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      toastQueueRef.current = [];
      void supabase.removeChannel(channelRef);
    };
  }, [incrementUnread, isAdmin, isViewActive, queueAdminDmToast, userId]);

  const totalUnread = Object.values(unreadByView).reduce((sum, count) => sum + count, 0);

  return {
    unreadByView,
    totalUnread,
    adminDmToast,
    dismissAdminDmToast,
    refreshUnreadCounts,
  };
}

export function getUnreadCountForChannelTab(
  unreadByView: Record<CommunityUnreadView, number>,
  channel: CommunityChannel,
  activeView: CommunityChatView,
  open: boolean,
): number {
  if (open && activeView === channel) return 0;
  return unreadByView[channel] ?? 0;
}

export function getUnreadCountForAdminContactTab(
  unreadByView: Record<CommunityUnreadView, number>,
  activeView: CommunityChatView,
  open: boolean,
  isAdmin = false,
): number {
  if (open && activeView === 'admin-contact') return 0;
  if (isAdmin) {
    return unreadByView['admin-contact'] ?? 0;
  }
  return unreadByView['admin-contact'] ?? 0;
}

export function getUnreadCountForAdminInboxTab(
  unreadByView: Record<CommunityUnreadView, number>,
  activeView: CommunityChatView,
  open: boolean,
): number {
  if (open && activeView === 'admin-inbox') return 0;
  return unreadByView['admin-inbox'] ?? 0;
}
