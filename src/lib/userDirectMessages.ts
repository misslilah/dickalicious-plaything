import {
  COMMUNITY_MESSAGE_MAX_LENGTH,
  COMMUNITY_SEND_COOLDOWN_MS,
} from './communityChat';
import { getSupabase, isSupabaseConfigured } from './supabase';

export const USER_DM_MIGRATION_HINT =
  'Private messages are not set up yet. In Supabase SQL Editor, run supabase/migrations/097_profile_social.sql, then retry.';

export const USER_DM_PAGE_SIZE = 200;
export const USER_DM_MAX_LENGTH = COMMUNITY_MESSAGE_MAX_LENGTH;
export const USER_DM_SEND_COOLDOWN_MS = COMMUNITY_SEND_COOLDOWN_MS;
export const OPEN_USER_DM_EVENT = 'open-user-dm';

export type OpenUserDmDetail = {
  userId: string;
  username: string;
};

export interface UserDirectMessage {
  id: string;
  fromId: string;
  toId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export type UserDmConversation = {
  peerId: string;
  username: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
};

type UserDirectMessageRow = {
  id: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

function mapRow(row: UserDirectMessageRow): UserDirectMessage {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export function requestOpenUserDm(userId: string, username: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenUserDmDetail>(OPEN_USER_DM_EVENT, {
      detail: { userId, username },
    }),
  );
}

export function normalizeUserDmBody(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > USER_DM_MAX_LENGTH) {
    return trimmed.slice(0, USER_DM_MAX_LENGTH);
  }
  return trimmed;
}

function isMissingTableError(message: string): boolean {
  return /user_direct_messages|schema cache/i.test(message);
}

export function peerIdForMessage(
  message: UserDirectMessage,
  currentUserId: string,
): string {
  return message.fromId === currentUserId ? message.toId : message.fromId;
}

export function buildUserDmConversations(
  messages: UserDirectMessage[],
  currentUserId: string,
  usernames: Record<string, string>,
): UserDmConversation[] {
  const byPeer = new Map<string, UserDmConversation>();

  for (const msg of messages) {
    const peerId = peerIdForMessage(msg, currentUserId);
    let conv = byPeer.get(peerId);
    if (!conv) {
      conv = {
        peerId,
        username: usernames[peerId] ?? 'User',
        lastMessageAt: msg.createdAt,
        lastMessagePreview: msg.body,
        unreadCount: 0,
      };
      byPeer.set(peerId, conv);
    }

    if (msg.createdAt >= conv.lastMessageAt) {
      conv.lastMessageAt = msg.createdAt;
      conv.lastMessagePreview = msg.body;
    }

    if (msg.toId === currentUserId && !msg.readAt) {
      conv.unreadCount += 1;
    }
  }

  return Array.from(byPeer.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

async function fetchUsernames(
  userIds: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const supabase = getSupabase();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', unique);

  if (error) return {};

  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; username: string }[]) {
    map[row.id] = row.username;
  }
  return map;
}

export async function fetchUserDirectInbox(
  userId: string,
): Promise<
  | { ok: true; messages: UserDirectMessage[]; usernames: Record<string, string> }
  | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('user_direct_messages')
    .select('id, from_id, to_id, body, created_at, read_at')
    .or(`from_id.eq.${userId},to_id.eq.${userId}`)
    .order('created_at', { ascending: true })
    .limit(USER_DM_PAGE_SIZE);

  if (error) {
    if (isMissingTableError(error.message)) {
      return { ok: false, error: USER_DM_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  const messages = ((data ?? []) as UserDirectMessageRow[]).map(mapRow);
  const peerIds = messages.map((msg) => peerIdForMessage(msg, userId));
  const usernames = await fetchUsernames(peerIds);

  return { ok: true, messages, usernames };
}

export async function fetchUserDirectThread(
  currentUserId: string,
  peerId: string,
): Promise<{ ok: true; messages: UserDirectMessage[] } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('user_direct_messages')
    .select('id, from_id, to_id, body, created_at, read_at')
    .or(
      `and(from_id.eq.${currentUserId},to_id.eq.${peerId}),and(from_id.eq.${peerId},to_id.eq.${currentUserId})`,
    )
    .order('created_at', { ascending: true })
    .limit(USER_DM_PAGE_SIZE);

  if (error) {
    if (isMissingTableError(error.message)) {
      return { ok: false, error: USER_DM_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    messages: ((data ?? []) as UserDirectMessageRow[]).map(mapRow),
  };
}

export async function sendUserDirectMessage(
  fromId: string,
  toId: string,
  body: string,
): Promise<{ ok: true; message: UserDirectMessage } | { ok: false; error: string }> {
  const normalized = normalizeUserDmBody(body);
  if (!normalized) {
    return { ok: false, error: 'Message cannot be empty.' };
  }
  if (fromId === toId) {
    return { ok: false, error: 'You cannot message yourself.' };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('user_direct_messages')
    .insert({
      from_id: fromId,
      to_id: toId,
      body: normalized,
    })
    .select('id, from_id, to_id, body, created_at, read_at')
    .single();

  if (error) {
    if (isMissingTableError(error.message)) {
      return { ok: false, error: USER_DM_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, message: mapRow(data as UserDirectMessageRow) };
}

export async function markUserDirectThreadRead(
  currentUserId: string,
  peerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('user_direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('to_id', currentUserId)
    .eq('from_id', peerId)
    .is('read_at', null);

  if (error) {
    if (isMissingTableError(error.message)) {
      return { ok: false, error: USER_DM_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function countUnreadUserDirectMessages(
  userId: string,
): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from('user_direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('to_id', userId)
    .is('read_at', null);

  if (error) return 0;
  return count ?? 0;
}
