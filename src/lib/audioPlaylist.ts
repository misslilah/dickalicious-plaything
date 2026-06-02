import type { AudioPlaylist, AudioPlaylistItem, PatreonMemberTier } from '../types';
import { wouldCreateUnlockCycle } from './audioProgress';
import { getSupabase } from './supabase';
import {
  uploadToSupabaseStorage,
  type UploadProgressCallback,
} from './storageUploadWithProgress';

const AUDIO_BUCKET = 'audio-playlist';

export const AUDIO_ACCEPT =
  'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg';

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

const MIGRATION_HINT =
  'Audio playlist is not set up yet. In Supabase SQL Editor, run supabase/migrations/025_audio_playlist.sql, 026_audio_playlists.sql, and 027_audio_playlist_patreon_tier.sql, then retry.';

const BUCKET_HINT =
  'The audio-playlist storage bucket is not set up yet. In Supabase SQL Editor, run supabase/migrations/025_audio_playlist.sql, then retry the upload.';

type DbAudioPlaylist = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  unlock_after_playlist_id: string | null;
  patreon_tier: string | null;
  created_at: string;
};

type DbAudioItem = {
  id: string;
  playlist_id: string;
  title: string;
  storage_path: string;
  sort_order: number;
  duration_seconds: number | null;
  created_at: string;
};

export interface AudioLibrary {
  playlists: AudioPlaylist[];
  items: AudioPlaylistItem[];
}

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.audio_playlist_items'") ||
    message.includes("Could not find the table 'public.audio_playlists'")
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

function mapPlaylist(row: DbAudioPlaylist): AudioPlaylist {
  const tier = row.patreon_tier;
  const patreonTier =
    tier === 'sweetie' || tier === 'princess' || tier === 'slut' ? tier : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    unlockAfterPlaylistId: row.unlock_after_playlist_id,
    patreonTier,
    createdAt: row.created_at,
  };
}

export function audioStoragePath(itemId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${itemId}/${safe}`;
}

export function getAudioPublicUrl(storagePath: string): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? null;
}

function mapItem(row: DbAudioItem): AudioPlaylistItem | null {
  const url = getAudioPublicUrl(row.storage_path);
  if (!url) return null;
  return {
    id: row.id,
    playlistId: row.playlist_id,
    title: row.title,
    storagePath: row.storage_path,
    sortOrder: row.sort_order,
    durationSeconds: row.duration_seconds,
    url,
    createdAt: row.created_at,
  };
}

export async function fetchAudioLibrary(): Promise<
  { ok: true; library: AudioLibrary } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const [playlistsRes, itemsRes] = await Promise.all([
    supabase
      .from('audio_playlists')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('audio_playlist_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (playlistsRes.error) return { ok: false, error: formatDbError(playlistsRes.error) };
  if (itemsRes.error) return { ok: false, error: formatDbError(itemsRes.error) };

  const playlists = (playlistsRes.data as DbAudioPlaylist[]).map(mapPlaylist);
  const items = (itemsRes.data as DbAudioItem[])
    .map(mapItem)
    .filter((item): item is AudioPlaylistItem => item != null);

  return { ok: true, library: { playlists, items } };
}

/** @deprecated Use fetchAudioLibrary */
export async function fetchAudioPlaylist(): Promise<
  { ok: true; items: AudioPlaylistItem[] } | { ok: false; error: string }
> {
  const result = await fetchAudioLibrary();
  if (!result.ok) return result;
  return { ok: true, items: result.library.items };
}

export async function uploadAudioFile(
  storagePath: string,
  file: Blob,
  mimeType: string,
  onProgress?: UploadProgressCallback,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await uploadToSupabaseStorage({
    bucket: AUDIO_BUCKET,
    storagePath,
    file,
    contentType: mimeType,
    upsert: true,
    onProgress,
  });
  if (!result.ok) return { ok: false, error: formatUploadError({ message: result.error }) };
  return { ok: true };
}

export async function deleteAudioFile(
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function nextPlaylistSortOrder(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data } = await supabase
    .from('audio_playlists')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { sort_order: number } | null;
  return (row?.sort_order ?? -1) + 1;
}

async function nextTrackSortOrder(playlistId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data } = await supabase
    .from('audio_playlist_items')
    .select('sort_order')
    .eq('playlist_id', playlistId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { sort_order: number } | null;
  return (row?.sort_order ?? -1) + 1;
}

export async function insertAudioPlaylist(
  title: string,
  description: string | null,
  unlockAfterPlaylistId: string | null,
  patreonTier: PatreonMemberTier | null,
  existingPlaylists: AudioPlaylist[],
): Promise<
  { ok: true; playlist: AudioPlaylist } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: 'Playlist title is required.' };

  const id = crypto.randomUUID();
  if (
    unlockAfterPlaylistId &&
    wouldCreateUnlockCycle(id, unlockAfterPlaylistId, existingPlaylists)
  ) {
    return { ok: false, error: 'That unlock dependency would create a cycle.' };
  }

  const sortOrder = await nextPlaylistSortOrder();
  const { data, error } = await supabase
    .from('audio_playlists')
    .insert({
      id,
      title: trimmed,
      description: description?.trim() || null,
      sort_order: sortOrder,
      unlock_after_playlist_id: unlockAfterPlaylistId,
      patreon_tier: patreonTier,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, playlist: mapPlaylist(data as DbAudioPlaylist) };
}

export async function updateAudioPlaylist(
  id: string,
  updates: {
    title?: string;
    description?: string | null;
    unlockAfterPlaylistId?: string | null;
    patreonTier?: PatreonMemberTier | null;
  },
  existingPlaylists: AudioPlaylist[],
): Promise<{ ok: true; playlist: AudioPlaylist } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const unlockAfter =
    updates.unlockAfterPlaylistId === undefined
      ? undefined
      : updates.unlockAfterPlaylistId;

  if (unlockAfter === id) {
    return { ok: false, error: 'A playlist cannot unlock after itself.' };
  }

  if (
    unlockAfter != null &&
    wouldCreateUnlockCycle(id, unlockAfter, existingPlaylists)
  ) {
    return { ok: false, error: 'That unlock dependency would create a cycle.' };
  }

  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) {
    const trimmed = updates.title.trim();
    if (!trimmed) return { ok: false, error: 'Playlist title is required.' };
    payload.title = trimmed;
  }
  if (updates.description !== undefined) {
    payload.description = updates.description?.trim() || null;
  }
  if (unlockAfter !== undefined) {
    payload.unlock_after_playlist_id = unlockAfter;
  }
  if (updates.patreonTier !== undefined) {
    payload.patreon_tier = updates.patreonTier;
  }

  const { data, error } = await supabase
    .from('audio_playlists')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, playlist: mapPlaylist(data as DbAudioPlaylist) };
}

export async function deleteAudioPlaylist(
  id: string,
  items: AudioPlaylistItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const playlistItems = items.filter((item) => item.playlistId === id);
  for (const item of playlistItems) {
    await deleteAudioFile(item.storagePath);
  }

  const { error } = await supabase.from('audio_playlists').delete().eq('id', id);
  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true };
}

export async function updateAudioPlaylistsOrder(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('audio_playlists')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);
    if (error) return { ok: false, error: formatDbError(error) };
  }
  return { ok: true };
}

export async function insertAudioPlaylistItem(
  playlistId: string,
  title: string,
  file: File,
  durationSeconds: number | null,
  onProgress?: UploadProgressCallback,
): Promise<
  { ok: true; item: AudioPlaylistItem } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const id = crypto.randomUUID();
  const path = audioStoragePath(id, file.name);
  const upload = await uploadAudioFile(
    path,
    file,
    file.type || 'audio/mpeg',
    onProgress,
  );
  if (!upload.ok) return upload;

  const sortOrder = await nextTrackSortOrder(playlistId);
  const { data, error } = await supabase
    .from('audio_playlist_items')
    .insert({
      id,
      playlist_id: playlistId,
      title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
      storage_path: path,
      sort_order: sortOrder,
      duration_seconds: durationSeconds,
    })
    .select('*')
    .single();

  if (error) {
    await deleteAudioFile(path);
    return { ok: false, error: formatDbError(error) };
  }

  const item = mapItem(data as DbAudioItem);
  if (!item) return { ok: false, error: 'Upload succeeded but URL is unavailable.' };
  return { ok: true, item };
}

export async function deleteAudioPlaylistItem(
  id: string,
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.from('audio_playlist_items').delete().eq('id', id);
  if (error) return { ok: false, error: formatDbError(error) };

  await deleteAudioFile(storagePath);
  return { ok: true };
}

export async function updateAudioPlaylistOrder(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('audio_playlist_items')
      .update({ sort_order: i })
      .eq('id', orderedIds[i]);
    if (error) return { ok: false, error: formatDbError(error) };
  }
  return { ok: true };
}

export async function updateAudioPlaylistTitle(
  id: string,
  title: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('audio_playlist_items')
    .update({ title: title.trim() })
    .eq('id', id);

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true };
}

export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : null;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

export function itemsForPlaylist(
  playlistId: string,
  items: AudioPlaylistItem[],
): AudioPlaylistItem[] {
  return items
    .filter((item) => item.playlistId === playlistId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export function trackIdsByPlaylist(
  items: AudioPlaylistItem[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const item of items) {
    if (!map[item.playlistId]) map[item.playlistId] = [];
    map[item.playlistId].push(item.id);
  }
  for (const playlistId of Object.keys(map)) {
    map[playlistId].sort((a, b) => {
      const itemA = items.find((i) => i.id === a);
      const itemB = items.find((i) => i.id === b);
      return (itemA?.sortOrder ?? 0) - (itemB?.sortOrder ?? 0);
    });
  }
  return map;
}
