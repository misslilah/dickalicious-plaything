import type { CommunityChannel } from './communityChannels';
import { getSupabase, isSupabaseConfigured } from './supabase';

export const COMMUNITY_CHAT_MIGRATION_HINT =
  'Community chat is not set up yet. In Supabase SQL Editor, run supabase/migrations/052_community_chat.sql, then retry.';

export const COMMUNITY_MESSAGE_MAX_LENGTH = 2000;
export const COMMUNITY_SEND_COOLDOWN_MS = 3000;
export const COMMUNITY_MESSAGES_PAGE_SIZE = 100;

export interface CommunityMessage {
  id: string;
  channel: CommunityChannel;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}

type CommunityMessageRow = {
  id: string;
  channel: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
};

function mapRow(row: CommunityMessageRow): CommunityMessage {
  return {
    id: row.id,
    channel: row.channel as CommunityChannel,
    userId: row.user_id,
    username: row.username,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function normalizeCommunityBody(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > COMMUNITY_MESSAGE_MAX_LENGTH) {
    return trimmed.slice(0, COMMUNITY_MESSAGE_MAX_LENGTH);
  }
  return trimmed;
}

export async function fetchCommunityMessages(
  channel: CommunityChannel,
): Promise<{ ok: true; messages: CommunityMessage[] } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('community_messages')
    .select('id, channel, user_id, username, body, created_at')
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(COMMUNITY_MESSAGES_PAGE_SIZE);

  if (error) {
    if (/community_messages|schema cache/i.test(error.message)) {
      return { ok: false, error: COMMUNITY_CHAT_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    messages: (data ?? []).map((row) => mapRow(row as CommunityMessageRow)),
  };
}

export async function sendCommunityMessage(
  channel: CommunityChannel,
  userId: string,
  username: string,
  body: string,
): Promise<{ ok: true; message: CommunityMessage } | { ok: false; error: string }> {
  const normalized = normalizeCommunityBody(body);
  if (!normalized) {
    return { ok: false, error: 'Message cannot be empty.' };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('community_messages')
    .insert({
      channel,
      user_id: userId,
      username: username.trim() || 'User',
      body: normalized,
    })
    .select('id, channel, user_id, username, body, created_at')
    .single();

  if (error) {
    if (/community_messages|schema cache/i.test(error.message)) {
      return { ok: false, error: COMMUNITY_CHAT_MIGRATION_HINT };
    }
    if (/row-level security|policy/i.test(error.message)) {
      return { ok: false, error: 'You do not have access to post in this channel.' };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, message: mapRow(data as CommunityMessageRow) };
}
