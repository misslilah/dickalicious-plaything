import { getSupabase } from './supabase';

export const FOLLOW_INSTINCT_BUCKET = 'follow-instinct-images';

export const MAX_FOLLOW_INSTINCT_IMAGE_BYTES = 5 * 1024 * 1024;

export const FOLLOW_INSTINCT_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

const MIGRATION_HINT =
  'Follow your instinct is not set up yet. In Supabase SQL Editor, run supabase/migrations/033_follow_instinct_game.sql, then retry.';

const BUCKET_HINT =
  'The follow-instinct-images storage bucket is not set up yet. In Supabase SQL Editor, run supabase/migrations/033_follow_instinct_game.sql, then retry the upload.';

export interface FollowInstinctGame {
  id: string;
  title: string;
  description: string | null;
  leftImagePath: string;
  rightImagePath: string;
  leftImageUrl: string;
  rightImageUrl: string;
  createdAt: string;
}

export interface FollowInstinctGameSummary {
  id: string;
  title: string;
  description: string | null;
  leftImageUrl: string;
  createdAt: string;
}

export interface FollowInstinctGameInput {
  title: string;
  description: string | null;
}

type DbFollowInstinctGame = {
  id: string;
  title: string;
  description: string | null;
  left_image_path: string;
  right_image_path: string;
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
  return message;
}

function formatUploadError(error: { message?: string }): string {
  const message = error.message ?? 'Upload failed.';
  if (/bucket not found/i.test(message)) return BUCKET_HINT;
  return message;
}

export function followInstinctStoragePath(
  gameId: string,
  side: 'left' | 'right',
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${gameId}/${side}/${safe}`;
}

export function getFollowInstinctImageUrl(storagePath: string): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = supabase.storage.from(FOLLOW_INSTINCT_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? null;
}

function mapGame(row: DbFollowInstinctGame): FollowInstinctGame | null {
  const leftImageUrl = getFollowInstinctImageUrl(row.left_image_path);
  const rightImageUrl = getFollowInstinctImageUrl(row.right_image_path);
  if (!leftImageUrl || !rightImageUrl) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    leftImagePath: row.left_image_path,
    rightImagePath: row.right_image_path,
    leftImageUrl,
    rightImageUrl,
    createdAt: row.created_at,
  };
}

function mapSummary(row: DbFollowInstinctGame): FollowInstinctGameSummary | null {
  const leftImageUrl = getFollowInstinctImageUrl(row.left_image_path);
  if (!leftImageUrl) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    leftImageUrl,
    createdAt: row.created_at,
  };
}

function validateInput(title: string): string | null {
  if (!title.trim()) return 'Title is required.';
  return null;
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
  if (!game) return { ok: false, error: 'Game images could not be loaded.' };
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
  leftFile: File,
  rightFile: File,
): Promise<{ ok: true; game: FollowInstinctGame } | { ok: false; error: string }> {
  const validation = validateInput(input.title);
  if (validation) return { ok: false, error: validation };
  if (leftFile.size > MAX_FOLLOW_INSTINCT_IMAGE_BYTES) {
    return { ok: false, error: 'Left image must be 5 MB or smaller.' };
  }
  if (rightFile.size > MAX_FOLLOW_INSTINCT_IMAGE_BYTES) {
    return { ok: false, error: 'Right image must be 5 MB or smaller.' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const gameId = crypto.randomUUID();
  const leftPath = followInstinctStoragePath(gameId, 'left', leftFile.name);
  const rightPath = followInstinctStoragePath(gameId, 'right', rightFile.name);

  const leftUpload = await uploadImage(leftPath, leftFile);
  if (!leftUpload.ok) return leftUpload;
  const rightUpload = await uploadImage(rightPath, rightFile);
  if (!rightUpload.ok) {
    await removeImages([leftPath]);
    return rightUpload;
  }

  const { data, error } = await supabase
    .from('follow_instinct_games')
    .insert({
      id: gameId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      left_image_path: leftPath,
      right_image_path: rightPath,
    })
    .select('*')
    .single();

  if (error) {
    await removeImages([leftPath, rightPath]);
    return { ok: false, error: formatDbError(error) };
  }

  const game = mapGame(data as DbFollowInstinctGame);
  if (!game) {
    await removeImages([leftPath, rightPath]);
    return { ok: false, error: 'Game was created but images could not be loaded.' };
  }
  return { ok: true, game };
}

export async function updateFollowInstinctGame(
  gameId: string,
  input: FollowInstinctGameInput,
  options: { leftFile?: File; rightFile?: File },
): Promise<{ ok: true; game: FollowInstinctGame } | { ok: false; error: string }> {
  const validation = validateInput(input.title);
  if (validation) return { ok: false, error: validation };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existing = await fetchFollowInstinctGame(gameId);
  if (!existing.ok) return existing;

  let leftPath = existing.game.leftImagePath;
  let rightPath = existing.game.rightImagePath;
  const pathsToRemove: string[] = [];

  if (options.leftFile) {
    if (options.leftFile.size > MAX_FOLLOW_INSTINCT_IMAGE_BYTES) {
      return { ok: false, error: 'Left image must be 5 MB or smaller.' };
    }
    const nextPath = followInstinctStoragePath(gameId, 'left', options.leftFile.name);
    const uploaded = await uploadImage(nextPath, options.leftFile);
    if (!uploaded.ok) return uploaded;
    if (nextPath !== leftPath) pathsToRemove.push(leftPath);
    leftPath = nextPath;
  }

  if (options.rightFile) {
    if (options.rightFile.size > MAX_FOLLOW_INSTINCT_IMAGE_BYTES) {
      return { ok: false, error: 'Right image must be 5 MB or smaller.' };
    }
    const nextPath = followInstinctStoragePath(gameId, 'right', options.rightFile.name);
    const uploaded = await uploadImage(nextPath, options.rightFile);
    if (!uploaded.ok) return uploaded;
    if (nextPath !== rightPath) pathsToRemove.push(rightPath);
    rightPath = nextPath;
  }

  const { data, error } = await supabase
    .from('follow_instinct_games')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      left_image_path: leftPath,
      right_image_path: rightPath,
    })
    .eq('id', gameId)
    .select('*')
    .single();

  if (error) return { ok: false, error: formatDbError(error) };

  if (pathsToRemove.length > 0) await removeImages(pathsToRemove);

  const game = mapGame(data as DbFollowInstinctGame);
  if (!game) return { ok: false, error: 'Game was saved but images could not be loaded.' };
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

  await removeImages([existing.game.leftImagePath, existing.game.rightImagePath]);
  return { ok: true };
}
