import type { Session } from '../types';
import {
  COMMUNITY_MESSAGE_MAX_LENGTH,
  COMMUNITY_SEND_COOLDOWN_MS,
} from './communityChat';
import { getSupabase, isSupabaseConfigured } from './supabase';

export const ADMIN_DM_MIGRATION_HINT =
  'Admin messaging is not set up yet. In Supabase SQL Editor, run supabase/migrations/053_admin_direct_messages.sql, then retry.';

export const ADMIN_DM_PAGE_SIZE = 200;
export { COMMUNITY_MESSAGE_MAX_LENGTH as ADMIN_DM_MAX_LENGTH };
export { COMMUNITY_SEND_COOLDOWN_MS as ADMIN_DM_SEND_COOLDOWN_MS };

export const ADMIN_DM_SENDER_NAME = 'Dickalicious';

export interface AdminDirectMessage {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  fromAdmin: boolean;
}

type AdminDirectMessageRow = {
  id: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
  read_at: string | null;
  from_admin?: boolean;
};

export function isCommunityAdmin(
  session: Pick<Session, 'role' | 'username'> | null | undefined,
): boolean {
  if (!session) return false;
  if (session.role === 'admin') return true;
  return session.username.trim().toLowerCase() === 'dickalicious';
}

function mapRow(row: AdminDirectMessageRow): AdminDirectMessage {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    fromAdmin: row.from_admin === true,
  };
}

export function isAdminDirectMessageFromAdmin(message: AdminDirectMessage): boolean {
  return message.fromAdmin;
}

export function normalizeAdminDmBody(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > COMMUNITY_MESSAGE_MAX_LENGTH) {
    return trimmed.slice(0, COMMUNITY_MESSAGE_MAX_LENGTH);
  }
  return trimmed;
}

export async function fetchOwnAdminDirectMessages(
  userId: string,
): Promise<{ ok: true; messages: AdminDirectMessage[] } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('admin_direct_messages')
    .select('id, user_id, username, body, created_at, read_at, from_admin')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(ADMIN_DM_PAGE_SIZE);

  if (error) {
    if (/admin_direct_messages|schema cache/i.test(error.message)) {
      return { ok: false, error: ADMIN_DM_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    messages: (data ?? []).map((row) => mapRow(row as AdminDirectMessageRow)),
  };
}

export async function fetchAdminDirectInbox(): Promise<
  { ok: true; messages: AdminDirectMessage[] } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase
    .from('admin_direct_messages')
    .select('id, user_id, username, body, created_at, read_at, from_admin')
    .order('created_at', { ascending: true })
    .limit(ADMIN_DM_PAGE_SIZE);

  if (error) {
    if (/admin_direct_messages|schema cache/i.test(error.message)) {
      return { ok: false, error: ADMIN_DM_MIGRATION_HINT };
    }
    if (/row-level security|policy/i.test(error.message)) {
      return { ok: false, error: 'Admin inbox access required.' };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    messages: (data ?? []).map((row) => mapRow(row as AdminDirectMessageRow)),
  };
}

export async function sendAdminDirectMessage(
  userId: string,
  username: string,
  body: string,
): Promise<{ ok: true; message: AdminDirectMessage } | { ok: false; error: string }> {
  const normalized = normalizeAdminDmBody(body);
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
    .from('admin_direct_messages')
    .insert({
      user_id: userId,
      username: username.trim() || 'User',
      body: normalized,
      from_admin: false,
    })
    .select('id, user_id, username, body, created_at, read_at, from_admin')
    .single();

  if (error) {
    if (/admin_direct_messages|schema cache/i.test(error.message)) {
      return { ok: false, error: ADMIN_DM_MIGRATION_HINT };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, message: mapRow(data as AdminDirectMessageRow) };
}

export async function markAdminDirectMessageRead(
  messageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('admin_direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function sendAdminDirectReply(
  targetUserId: string,
  body: string,
): Promise<{ ok: true; message: AdminDirectMessage } | { ok: false; error: string }> {
  const normalized = normalizeAdminDmBody(body);
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
    .from('admin_direct_messages')
    .insert({
      user_id: targetUserId,
      username: ADMIN_DM_SENDER_NAME,
      body: normalized,
      from_admin: true,
    })
    .select('id, user_id, username, body, created_at, read_at, from_admin')
    .single();

  if (error) {
    if (/admin_direct_messages|schema cache/i.test(error.message)) {
      return { ok: false, error: ADMIN_DM_MIGRATION_HINT };
    }
    if (/from_admin|column/i.test(error.message)) {
      return {
        ok: false,
        error:
          'Admin replies require supabase/migrations/063_admin_dm_replies.sql. Run it in the Supabase SQL Editor, then retry.',
      };
    }
    if (/row-level security|policy/i.test(error.message)) {
      return { ok: false, error: 'Admin access required.' };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, message: mapRow(data as AdminDirectMessageRow) };
}
