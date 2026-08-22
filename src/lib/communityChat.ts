import type { CommunityChannel } from './communityChannels';
import { getSupabase, isSupabaseConfigured } from './supabase';

export const COMMUNITY_CHAT_MIGRATION_HINT =
  'Community chat is not set up yet. In Supabase SQL Editor, run supabase/migrations/052_community_chat.sql and 084_community_announcements_admin_tools.sql, then retry.';

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
  heartCount: number;
  hearted: boolean;
}

type CommunityMessageRow = {
  id: string;
  channel: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
};

type CommunityReactionRow = {
  message_id: string;
  user_id: string;
};

function mapRow(
  row: CommunityMessageRow,
  heartCount = 0,
  hearted = false,
): CommunityMessage {
  return {
    id: row.id,
    channel: row.channel as CommunityChannel,
    userId: row.user_id,
    username: row.username,
    body: row.body,
    createdAt: row.created_at,
    heartCount,
    hearted,
  };
}

async function fetchHeartMeta(
  messageIds: string[],
  currentUserId: string | undefined,
): Promise<Map<string, { heartCount: number; hearted: boolean }>> {
  const meta = new Map<string, { heartCount: number; hearted: boolean }>();
  if (messageIds.length === 0) return meta;

  const supabase = getSupabase();
  if (!supabase) return meta;

  const { data, error } = await supabase
    .from('community_message_reactions')
    .select('message_id, user_id')
    .in('message_id', messageIds)
    .eq('reaction', 'heart');

  if (error) return meta;

  for (const row of (data ?? []) as CommunityReactionRow[]) {
    const existing = meta.get(row.message_id) ?? { heartCount: 0, hearted: false };
    existing.heartCount += 1;
    if (currentUserId && row.user_id === currentUserId) {
      existing.hearted = true;
    }
    meta.set(row.message_id, existing);
  }

  return meta;
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
  currentUserId?: string,
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
    if (/community_messages|community_message_reactions|schema cache/i.test(error.message)) {
      return { ok: false, error: COMMUNITY_CHAT_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as CommunityMessageRow[];
  const heartMeta = await fetchHeartMeta(
    rows.map((row) => row.id),
    currentUserId,
  );

  return {
    ok: true,
    messages: rows.map((row) => {
      const hearts = heartMeta.get(row.id);
      return mapRow(row, hearts?.heartCount ?? 0, hearts?.hearted ?? false);
    }),
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

export async function adminClearCommunityMessages(): Promise<
  { ok: true; deleted: number } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase.rpc('admin_clear_community_messages');

  if (error) {
    const missingRpc =
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /admin_clear_community_messages/i.test(error.message ?? '') ||
      /function.*does not exist/i.test(error.message ?? '');
    if (missingRpc) {
      return {
        ok: false,
        error:
          'Clearing chat requires supabase/migrations/095_admin_clear_community_messages.sql. Run it in the Supabase SQL Editor, then retry.',
      };
    }
    if (/row-level security|policy|Admin access required/i.test(error.message ?? '')) {
      return { ok: false, error: 'You do not have permission to clear community chat.' };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, deleted: typeof data === 'number' ? data : Number(data) || 0 };
}

export async function deleteCommunityMessage(
  messageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { error } = await supabase.from('community_messages').delete().eq('id', messageId);

  if (error) {
    if (/row-level security|policy/i.test(error.message)) {
      return { ok: false, error: 'You do not have permission to delete this message.' };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function toggleCommunityMessageHeart(
  messageId: string,
  userId: string,
  hearted: boolean,
): Promise<
  | { ok: true; hearted: boolean; heartCount: number }
  | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  if (hearted) {
    const { error } = await supabase.from('community_message_reactions').delete().match({
      message_id: messageId,
      user_id: userId,
      reaction: 'heart',
    });

    if (error) {
      return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase.from('community_message_reactions').insert({
      message_id: messageId,
      user_id: userId,
      reaction: 'heart',
    });

    if (error) {
      return { ok: false, error: error.message };
    }
  }

  const { count, error: countError } = await supabase
    .from('community_message_reactions')
    .select('id', { count: 'exact', head: true })
    .eq('message_id', messageId)
    .eq('reaction', 'heart');

  if (countError) {
    return { ok: false, error: countError.message };
  }

  return {
    ok: true,
    hearted: !hearted,
    heartCount: count ?? 0,
  };
}
