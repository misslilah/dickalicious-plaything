import { getSupabase } from './supabase';

export const FOLLOW_INSTINCT_BUCKET = 'follow-instinct-images';

export const MAX_FOLLOW_INSTINCT_IMAGE_BYTES = 5 * 1024 * 1024;

export const FOLLOW_INSTINCT_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

const MIGRATION_HINT =
  'Follow your instinct is not set up yet. In Supabase SQL Editor, run supabase/migrations/033_follow_instinct_game.sql and 057_follow_instinct_v2.sql, then retry.';

const BUCKET_HINT =
  'The follow-instinct-images storage bucket is not set up yet. In Supabase SQL Editor, run supabase/migrations/033_follow_instinct_game.sql, then retry the upload.';

export type FollowInstinctChallengeMode = 'close_eyes' | 'mouth_tongue' | 'both';

export type FollowInstinctOrderType = 'close_eyes' | 'open_mouth' | 'tongue_out';

export const FOLLOW_INSTINCT_ORDER_LABELS: Record<FollowInstinctOrderType, string> = {
  close_eyes: 'Close your eyes',
  open_mouth: 'Open your mouth',
  tongue_out: 'Stick your tongue out',
};

export const FOLLOW_INSTINCT_CHALLENGE_MODE_LABELS: Record<FollowInstinctChallengeMode, string> = {
  close_eyes: 'Close your eyes',
  mouth_tongue: 'Open mouth / Stick tongue out',
  both: 'Mixed rounds',
};

export interface FollowInstinctRound {
  imagePath: string;
  imageUrl: string;
  orderText: string;
  orderType: FollowInstinctOrderType;
  phraseToType?: string | null;
}

export interface FollowInstinctGame {
  id: string;
  title: string;
  description: string | null;
  challengeMode: FollowInstinctChallengeMode;
  rounds: FollowInstinctRound[];
  createdAt: string;
}

export interface FollowInstinctGameSummary {
  id: string;
  title: string;
  description: string | null;
  previewImageUrl: string;
  roundCount: number;
  createdAt: string;
}

export interface FollowInstinctGameInput {
  title: string;
  description: string | null;
}

export interface FollowInstinctRoundDraft {
  id: string;
  orderType: FollowInstinctOrderType;
  orderText: string;
  phraseToType?: string;
  imagePath?: string;
  imageUrl?: string;
  file?: File;
}

type DbFollowInstinctRound = {
  image_path: string;
  order_text: string;
  order_type: FollowInstinctOrderType;
  phrase_to_type?: string | null;
};

export function followInstinctRoundRequiresPhrase(
  round: Pick<FollowInstinctRound, 'phraseToType'>,
): boolean {
  return Boolean(round.phraseToType?.trim());
}

export function followInstinctPhraseMatches(
  phraseToType: string | null | undefined,
  typed: string,
): boolean {
  const expected = phraseToType?.trim();
  if (!expected) return true;
  return typed.trim().toLowerCase() === expected.toLowerCase();
}

type DbFollowInstinctGame = {
  id: string;
  title: string;
  description: string | null;
  challenge_mode: FollowInstinctChallengeMode;
  rounds: DbFollowInstinctRound[] | null;
  left_image_path: string | null;
  right_image_path: string | null;
  created_at: string;
};

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.follow_instinct_games'")
  ) {
    return MIGRATION_HINT;
  }
  if (message.includes('challenge_mode') || message.includes('rounds')) {
    return MIGRATION_HINT;
  }
  return message;
}

function formatUploadError(error: { message?: string }): string {
  const message = error.message ?? 'Upload failed.';
  if (/bucket not found/i.test(message)) return BUCKET_HINT;
  return message;
}

export function followInstinctStoragePath(
  gameId: string,
  roundId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${gameId}/rounds/${roundId}/${safe}`;
}

export function getFollowInstinctImageUrl(storagePath: string): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = supabase.storage.from(FOLLOW_INSTINCT_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? null;
}

function parseDbRounds(raw: DbFollowInstinctGame): DbFollowInstinctRound[] {
  if (Array.isArray(raw.rounds) && raw.rounds.length > 0) {
    return raw.rounds.filter(
      (round): round is DbFollowInstinctRound =>
        typeof round?.image_path === 'string' &&
        typeof round?.order_text === 'string' &&
        typeof round?.order_type === 'string',
    );
  }
  const legacy: DbFollowInstinctRound[] = [];
  if (raw.left_image_path) {
    legacy.push({
      image_path: raw.left_image_path,
      order_text: FOLLOW_INSTINCT_ORDER_LABELS.close_eyes,
      order_type: 'close_eyes',
    });
  }
  if (raw.right_image_path) {
    legacy.push({
      image_path: raw.right_image_path,
      order_text: FOLLOW_INSTINCT_ORDER_LABELS.open_mouth,
      order_type: 'open_mouth',
    });
  }
  return legacy;
}

function mapRounds(dbRounds: DbFollowInstinctRound[]): FollowInstinctRound[] {
  const mapped: FollowInstinctRound[] = [];
  for (const round of dbRounds) {
    const imageUrl = getFollowInstinctImageUrl(round.image_path);
    if (!imageUrl) continue;
    const phraseToType = round.phrase_to_type?.trim() || null;
    mapped.push({
      imagePath: round.image_path,
      imageUrl,
      orderText: round.order_text.trim() || FOLLOW_INSTINCT_ORDER_LABELS[round.order_type],
      orderType: round.order_type,
      phraseToType,
    });
  }
  return mapped;
}

function mapGame(row: DbFollowInstinctGame): FollowInstinctGame | null {
  const rounds = mapRounds(parseDbRounds(row));
  if (rounds.length === 0) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    challengeMode: row.challenge_mode ?? 'both',
    rounds,
    createdAt: row.created_at,
  };
}

function mapSummary(row: DbFollowInstinctGame): FollowInstinctGameSummary | null {
  const rounds = mapRounds(parseDbRounds(row));
  if (rounds.length === 0) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    previewImageUrl: rounds[0].imageUrl,
    roundCount: rounds.length,
    createdAt: row.created_at,
  };
}

function validateInput(title: string, rounds: FollowInstinctRoundDraft[]): string | null {
  if (!title.trim()) return 'Title is required.';
  if (rounds.length === 0) return 'Add at least one photo + order round.';
  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index];
    if (!round.imagePath && !round.file) {
      return `Round ${index + 1} needs a photo.`;
    }
    if (!round.orderText.trim()) {
      return `Round ${index + 1} needs order text.`;
    }
  }
  return null;
}

function orderTypesAllowedForMode(mode: FollowInstinctChallengeMode): FollowInstinctOrderType[] {
  if (mode === 'close_eyes') return ['close_eyes'];
  if (mode === 'mouth_tongue') return ['open_mouth', 'tongue_out'];
  return ['close_eyes', 'open_mouth', 'tongue_out'];
}

export function validateRoundsForChallengeMode(
  mode: FollowInstinctChallengeMode,
  rounds: FollowInstinctRoundDraft[],
): string | null {
  const allowed = new Set(orderTypesAllowedForMode(mode));
  for (let index = 0; index < rounds.length; index += 1) {
    if (!allowed.has(rounds[index].orderType)) {
      return `Round ${index + 1} order type does not match the selected challenge mode.`;
    }
  }
  return null;
}

function serializeRounds(rounds: FollowInstinctRound[]): DbFollowInstinctRound[] {
  return rounds.map((round) => {
    const serialized: DbFollowInstinctRound = {
      image_path: round.imagePath,
      order_text: round.orderText,
      order_type: round.orderType,
    };
    const phrase = round.phraseToType?.trim();
    if (phrase) serialized.phrase_to_type = phrase;
    return serialized;
  });
}

async function uploadImage(
  storagePath: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.storage.from(FOLLOW_INSTINCT_BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) return { ok: false, error: formatUploadError(error) };
  return { ok: true };
}

async function removeImages(paths: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(FOLLOW_INSTINCT_BUCKET).remove(paths);
}

async function materializeRoundDrafts(
  gameId: string,
  drafts: FollowInstinctRoundDraft[],
): Promise<{ ok: true; rounds: FollowInstinctRound[] } | { ok: false; error: string }> {
  const rounds: FollowInstinctRound[] = [];
  const uploadedPaths: string[] = [];

  for (const draft of drafts) {
    let imagePath = draft.imagePath;
    if (draft.file) {
      if (draft.file.size > MAX_FOLLOW_INSTINCT_IMAGE_BYTES) {
        await removeImages(uploadedPaths);
        return { ok: false, error: 'Each round photo must be 5 MB or smaller.' };
      }
      imagePath = followInstinctStoragePath(gameId, draft.id, draft.file.name);
      const uploaded = await uploadImage(imagePath, draft.file);
      if (!uploaded.ok) {
        await removeImages(uploadedPaths);
        return uploaded;
      }
      uploadedPaths.push(imagePath);
    }
    if (!imagePath) {
      await removeImages(uploadedPaths);
      return { ok: false, error: 'Each round needs a photo.' };
    }
    const imageUrl = getFollowInstinctImageUrl(imagePath);
    if (!imageUrl) {
      await removeImages(uploadedPaths);
      return { ok: false, error: 'Round image could not be resolved.' };
    }
    const phraseToType = draft.phraseToType?.trim() || null;
    rounds.push({
      imagePath,
      imageUrl,
      orderText: draft.orderText.trim() || FOLLOW_INSTINCT_ORDER_LABELS[draft.orderType],
      orderType: draft.orderType,
      phraseToType,
    });
  }

  return { ok: true, rounds };
}

export async function fetchFollowInstinctGameSummaries(): Promise<
  { ok: true; games: FollowInstinctGameSummary[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('follow_instinct_games')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatDbError(error) };

  const games = (data as DbFollowInstinctGame[])
    .map(mapSummary)
    .filter((game): game is FollowInstinctGameSummary => game !== null);

  return { ok: true, games };
}

export async function fetchFollowInstinctGame(
  gameId: string,
): Promise<{ ok: true; game: FollowInstinctGame } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('follow_instinct_games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();

  if (error) return { ok: false, error: formatDbError(error) };
  if (!data) return { ok: false, error: 'Game not found.' };

  const game = mapGame(data as DbFollowInstinctGame);
  if (!game) return { ok: false, error: 'Game has no playable rounds.' };
  return { ok: true, game };
}

export async function fetchAllFollowInstinctGames(): Promise<
  { ok: true; games: FollowInstinctGame[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('follow_instinct_games')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatDbError(error) };

  const games = (data as DbFollowInstinctGame[])
    .map(mapGame)
    .filter((game): game is FollowInstinctGame => game !== null);

  return { ok: true, games };
}

export async function createFollowInstinctGame(
  input: FollowInstinctGameInput,
  roundDrafts: FollowInstinctRoundDraft[],
): Promise<{ ok: true; game: FollowInstinctGame } | { ok: false; error: string }> {
  const validation = validateInput(input.title, roundDrafts);
  if (validation) return { ok: false, error: validation };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const gameId = crypto.randomUUID();
  const materialized = await materializeRoundDrafts(gameId, roundDrafts);
  if (!materialized.ok) return materialized;

  const { data, error } = await supabase
    .from('follow_instinct_games')
    .insert({
      id: gameId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      challenge_mode: 'both',
      rounds: serializeRounds(materialized.rounds),
      left_image_path: null,
      right_image_path: null,
    })
    .select('*')
    .single();

  if (error) {
    await removeImages(materialized.rounds.map((round) => round.imagePath));
    return { ok: false, error: formatDbError(error) };
  }

  const game = mapGame(data as DbFollowInstinctGame);
  if (!game) {
    await removeImages(materialized.rounds.map((round) => round.imagePath));
    return { ok: false, error: 'Game was created but rounds could not be loaded.' };
  }
  return { ok: true, game };
}

export async function updateFollowInstinctGame(
  gameId: string,
  input: FollowInstinctGameInput,
  roundDrafts: FollowInstinctRoundDraft[],
): Promise<{ ok: true; game: FollowInstinctGame } | { ok: false; error: string }> {
  const validation = validateInput(input.title, roundDrafts);
  if (validation) return { ok: false, error: validation };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existing = await fetchFollowInstinctGame(gameId);
  if (!existing.ok) return existing;

  const materialized = await materializeRoundDrafts(gameId, roundDrafts);
  if (!materialized.ok) return materialized;

  const previousPaths = new Set(existing.game.rounds.map((round) => round.imagePath));
  const nextPaths = new Set(materialized.rounds.map((round) => round.imagePath));
  const pathsToRemove = [...previousPaths].filter((path) => !nextPaths.has(path));

  const { data, error } = await supabase
    .from('follow_instinct_games')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      challenge_mode: 'both',
      rounds: serializeRounds(materialized.rounds),
    })
    .eq('id', gameId)
    .select('*')
    .single();

  if (error) return { ok: false, error: formatDbError(error) };

  if (pathsToRemove.length > 0) await removeImages(pathsToRemove);

  const game = mapGame(data as DbFollowInstinctGame);
  if (!game) return { ok: false, error: 'Game was saved but rounds could not be loaded.' };
  return { ok: true, game };
}

export async function deleteFollowInstinctGame(
  gameId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existing = await fetchFollowInstinctGame(gameId);
  if (!existing.ok) return existing;

  const { error } = await supabase.from('follow_instinct_games').delete().eq('id', gameId);
  if (error) return { ok: false, error: formatDbError(error) };

  await removeImages(existing.game.rounds.map((round) => round.imagePath));
  return { ok: true };
}

export function newRoundDraft(orderType: FollowInstinctOrderType = 'close_eyes'): FollowInstinctRoundDraft {
  return {
    id: crypto.randomUUID(),
    orderType,
    orderText: FOLLOW_INSTINCT_ORDER_LABELS[orderType],
  };
}
