import { getSupabase } from './supabase';

export type LockCard = {
  id: string;
  userId: string;
  phrase: string;
  requiredCount: number;
  completedCount: number;
  createdBy: string;
  createdAt: string;
  clearedAt: string | null;
  active: boolean;
};

type DbLockCard = {
  id: string;
  user_id: string;
  phrase: string;
  required_count: number;
  completed_count: number;
  created_by: string;
  created_at: string;
  cleared_at: string | null;
  active: boolean;
};

const LOCK_CARDS_MIGRATION_HINT =
  'Lock cards are not set up yet. In Supabase SQL Editor, run supabase/migrations/024_user_lock_cards.sql, then reload the project.';

function mapLockCard(row: DbLockCard): LockCard {
  return {
    id: row.id,
    userId: row.user_id,
    phrase: row.phrase,
    requiredCount: row.required_count,
    completedCount: row.completed_count,
    createdBy: row.created_by,
    createdAt: row.created_at,
    clearedAt: row.cleared_at,
    active: row.active,
  };
}

function formatLockCardDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.user_lock_cards'") ||
    message.includes('submit_lock_card_phrase')
  ) {
    return LOCK_CARDS_MIGRATION_HINT;
  }
  return message;
}

export async function fetchActiveLockForUser(
  userId: string,
): Promise<{ ok: true; lockCard: LockCard | null } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('user_lock_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  if (error) return { ok: false, error: formatLockCardDbError(error) };
  return { ok: true, lockCard: data ? mapLockCard(data as DbLockCard) : null };
}

export async function fetchActiveLockCards(): Promise<
  { ok: true; lockCards: LockCard[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('user_lock_cards')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatLockCardDbError(error) };
  return {
    ok: true,
    lockCards: (data as DbLockCard[]).map(mapLockCard),
  };
}

export async function createLockCard(input: {
  userId: string;
  phrase: string;
  requiredCount: number;
  createdBy: string;
}): Promise<{ ok: true; lockCard: LockCard } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const phrase = input.phrase.trim();
  if (!phrase) return { ok: false, error: 'Phrase is required.' };
  const requiredCount = Math.max(1, Math.floor(input.requiredCount));

  const { error: clearError } = await supabase
    .from('user_lock_cards')
    .update({ active: false, cleared_at: new Date().toISOString() })
    .eq('user_id', input.userId)
    .eq('active', true);

  if (clearError) return { ok: false, error: formatLockCardDbError(clearError) };

  const { data, error } = await supabase
    .from('user_lock_cards')
    .insert({
      user_id: input.userId,
      phrase,
      required_count: requiredCount,
      created_by: input.createdBy,
      active: true,
    })
    .select('*')
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error ? formatLockCardDbError(error) : 'Failed to create lock card.',
    };
  }

  return { ok: true, lockCard: mapLockCard(data as DbLockCard) };
}

export async function clearLockCard(
  lockId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('user_lock_cards')
    .update({ active: false, cleared_at: new Date().toISOString() })
    .eq('id', lockId)
    .eq('active', true);

  if (error) return { ok: false, error: formatLockCardDbError(error) };
  return { ok: true };
}

export type SubmitLockPhraseResult =
  | {
      ok: true;
      correct: boolean;
      completedCount: number;
      requiredCount: number;
      cleared: boolean;
    }
  | { ok: false; error: string };

export async function submitLockCardPhrase(
  lockId: string,
  phrase: string,
): Promise<SubmitLockPhraseResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.rpc('submit_lock_card_phrase', {
    lock_id: lockId,
    submitted_phrase: phrase,
  });

  if (error) return { ok: false, error: formatLockCardDbError(error) };

  const result = data as {
    ok?: boolean;
    error?: string;
    correct?: boolean;
    completed_count?: number;
    required_count?: number;
    cleared?: boolean;
  };

  if (!result?.ok) {
    return { ok: false, error: result?.error ?? 'Submission failed.' };
  }

  return {
    ok: true,
    correct: Boolean(result.correct),
    completedCount: result.completed_count ?? 0,
    requiredCount: result.required_count ?? 0,
    cleared: Boolean(result.cleared),
  };
}
