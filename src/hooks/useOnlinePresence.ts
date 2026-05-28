import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

export interface OnlineUser {
  id: string;
  username: string;
}

type PresencePayload = {
  user_id: string;
  username: string;
};

export type OnlinePresenceState = {
  onlineUsers: OnlineUser[];
  loading: boolean;
  error: string;
};

const CHANNEL_NAME = 'room:online-users';
const TRACK_REFRESH_MS = 30_000;

let sharedState: OnlinePresenceState = {
  onlineUsers: [],
  loading: false,
  error: '',
};

let channel: RealtimeChannel | null = null;
let trackIntervalId: number | undefined;
let refCount = 0;
let activeUser: { userId: string; username: string } | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setSharedState(partial: Partial<OnlinePresenceState>) {
  sharedState = { ...sharedState, ...partial };
  emit();
}

function presenceStateToUsers(
  state: Record<string, PresencePayload[]>,
): OnlineUser[] {
  const map = new Map<string, OnlineUser>();
  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      if (presence.user_id && !map.has(presence.user_id)) {
        map.set(presence.user_id, {
          id: presence.user_id,
          username: presence.username,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.username.localeCompare(b.username),
  );
}

function syncUsersFromChannel() {
  if (!channel) return;
  const raw = channel.presenceState() as Record<string, PresencePayload[]>;
  setSharedState({
    onlineUsers: presenceStateToUsers(raw),
    loading: false,
    error: '',
  });
}

function clearTrackInterval() {
  if (trackIntervalId !== undefined) {
    window.clearInterval(trackIntervalId);
    trackIntervalId = undefined;
  }
}

async function teardownChannel() {
  clearTrackInterval();
  const supabase = getSupabase();
  if (channel) {
    await channel.untrack();
    if (supabase) {
      await supabase.removeChannel(channel);
    }
    channel = null;
  }
  activeUser = null;
  setSharedState({ onlineUsers: [], loading: false, error: '' });
}

async function ensureChannel(userId: string, username: string) {
  const supabase = getSupabase();
  if (!supabase) {
    setSharedState({
      loading: false,
      error: 'Supabase is not configured.',
      onlineUsers: [],
    });
    return;
  }

  if (
    channel &&
    activeUser?.userId === userId &&
    activeUser.username === username
  ) {
    return;
  }

  await teardownChannel();
  activeUser = { userId, username };
  setSharedState({ loading: true, error: '' });

  const payload = (): PresencePayload => ({
    user_id: userId,
    username,
  });

  const nextChannel = supabase.channel(CHANNEL_NAME, {
    config: {
      presence: {
        key: userId,
      },
    },
  });

  nextChannel
    .on('presence', { event: 'sync' }, () => syncUsersFromChannel())
    .on('presence', { event: 'join' }, () => syncUsersFromChannel())
    .on('presence', { event: 'leave' }, () => syncUsersFromChannel())
    .subscribe(async (status, err) => {
      if (status === 'SUBSCRIBED') {
        const trackStatus = await nextChannel.track(payload());
        if (trackStatus !== 'ok') {
          setSharedState({
            loading: false,
            error: err?.message ?? 'Failed to announce online status.',
          });
          return;
        }
        syncUsersFromChannel();
        clearTrackInterval();
        trackIntervalId = window.setInterval(() => {
          void nextChannel.track(payload());
        }, TRACK_REFRESH_MS);
      } else if (status === 'CHANNEL_ERROR') {
        setSharedState({
          loading: false,
          error: err?.message ?? 'Realtime channel error.',
        });
      } else if (status === 'TIMED_OUT') {
        setSharedState({
          loading: false,
          error: 'Realtime connection timed out.',
        });
      }
    });

  channel = nextChannel;
}

/** Supabase Realtime Presence for the global online-users room (shared across hook instances). */
export function useOnlinePresence(
  userId: string | undefined,
  username: string | undefined,
): OnlinePresenceState {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (!userId || !username || !isSupabaseConfigured()) {
      return;
    }

    refCount += 1;
    void ensureChannel(userId, username);

    return () => {
      refCount -= 1;
      if (refCount <= 0) {
        refCount = 0;
        void teardownChannel();
      }
    };
  }, [userId, username]);

  return sharedState;
}
