import type { VideoPlaylist, VideoPlaylistItem, VideoPlaylistType } from '../types';
import { getSupabase } from './supabase';

const MIGRATION_HINT =
  'Video playlists are not set up yet. In Supabase SQL Editor, run supabase/migrations/049_video_playlists.sql, then retry.';

type DbVideoPlaylist = {
  id: string;
  user_id: string;
  title: string;
  type: VideoPlaylistType;
  sort_order: number;
  created_at: string;
};

type DbVideoPlaylistItem = {
  id: string;
  playlist_id: string;
  video_id: string;
  position: number;
  created_at: string;
};

export interface VideoPlaylistLibrary {
  playlists: VideoPlaylist[];
  items: VideoPlaylistItem[];
}

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.video_playlists'") ||
    message.includes("Could not find the table 'public.video_playlist_items'")
  ) {
    return MIGRATION_HINT;
  }
  return message;
}

function mapPlaylist(row: DbVideoPlaylist): VideoPlaylist {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    type: row.type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapItem(row: DbVideoPlaylistItem): VideoPlaylistItem {
  return {
    id: row.id,
    playlistId: row.playlist_id,
    videoId: row.video_id,
    position: row.position,
    createdAt: row.created_at,
  };
}

export async function fetchUserVideoPlaylists(
  type: VideoPlaylistType,
): Promise<
  { ok: true; library: VideoPlaylistLibrary } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, error: 'You must be signed in to view playlists.' };
  }

  const playlistsRes = await supabase
    .from('video_playlists')
    .select('*')
    .eq('user_id', authData.user.id)
    .eq('type', type)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (playlistsRes.error) {
    return { ok: false, error: formatDbError(playlistsRes.error) };
  }

  const playlists = (playlistsRes.data as DbVideoPlaylist[]).map(mapPlaylist);
  if (playlists.length === 0) {
    return { ok: true, library: { playlists: [], items: [] } };
  }

  const playlistIds = playlists.map((p) => p.id);
  const itemsRes = await supabase
    .from('video_playlist_items')
    .select('*')
    .in('playlist_id', playlistIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (itemsRes.error) {
    return { ok: false, error: formatDbError(itemsRes.error) };
  }

  const items = (itemsRes.data as DbVideoPlaylistItem[]).map(mapItem);
  return { ok: true, library: { playlists, items } };
}

async function nextPlaylistSortOrder(userId: string, type: VideoPlaylistType): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data } = await supabase
    .from('video_playlists')
    .select('sort_order')
    .eq('user_id', userId)
    .eq('type', type)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { sort_order: number } | null;
  return (row?.sort_order ?? -1) + 1;
}

export async function createVideoPlaylist(
  title: string,
  type: VideoPlaylistType,
): Promise<
  { ok: true; playlist: VideoPlaylist } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: 'Playlist name is required.' };

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, error: 'You must be signed in to create a playlist.' };
  }

  const sortOrder = await nextPlaylistSortOrder(authData.user.id, type);
  const { data, error } = await supabase
    .from('video_playlists')
    .insert({
      title: trimmed,
      type,
      user_id: authData.user.id,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, playlist: mapPlaylist(data as DbVideoPlaylist) };
}

export async function updateVideoPlaylistTitle(
  playlistId: string,
  title: string,
): Promise<{ ok: true; playlist: VideoPlaylist } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const trimmed = title.trim();
  if (!trimmed) return { ok: false, error: 'Playlist name is required.' };

  const { data, error } = await supabase
    .from('video_playlists')
    .update({ title: trimmed })
    .eq('id', playlistId)
    .select('*')
    .single();

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, playlist: mapPlaylist(data as DbVideoPlaylist) };
}

export async function deleteVideoPlaylist(
  playlistId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.from('video_playlists').delete().eq('id', playlistId);
  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true };
}

export async function replaceVideoPlaylistItems(
  playlistId: string,
  videoIds: string[],
): Promise<
  { ok: true; items: VideoPlaylistItem[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const uniqueIds = [...new Set(videoIds)];
  const { error: deleteError } = await supabase
    .from('video_playlist_items')
    .delete()
    .eq('playlist_id', playlistId);

  if (deleteError) return { ok: false, error: formatDbError(deleteError) };

  if (uniqueIds.length === 0) {
    return { ok: true, items: [] };
  }

  const rows = uniqueIds.map((videoId, index) => ({
    playlist_id: playlistId,
    video_id: videoId,
    position: index,
  }));

  const { data, error } = await supabase
    .from('video_playlist_items')
    .insert(rows)
    .select('*');

  if (error) return { ok: false, error: formatDbError(error) };
  const items = (data as DbVideoPlaylistItem[]).map(mapItem);
  return { ok: true, items };
}

export function itemsForVideoPlaylist(
  playlistId: string,
  items: VideoPlaylistItem[],
): VideoPlaylistItem[] {
  return items
    .filter((item) => item.playlistId === playlistId)
    .sort(
      (a, b) =>
        a.position - b.position || a.createdAt.localeCompare(b.createdAt),
    );
}

export function videoIdsForPlaylist(
  playlistId: string,
  items: VideoPlaylistItem[],
): string[] {
  return itemsForVideoPlaylist(playlistId, items).map((item) => item.videoId);
}
