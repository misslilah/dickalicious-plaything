import { getSupabase } from './supabase';
import { formatVideoSizeError, MAX_VIDEO_BYTES } from './videoStorage';

export const INTERACTIVE_VIDEOS_BUCKET = 'interactive-videos';

const MIGRATION_HINT =
  'Interactive videos are not set up yet. In Supabase SQL Editor, run supabase/migrations/035_interactive_videos.sql, then retry.';

const BUCKET_HINT =
  'The interactive-videos storage bucket is not set up yet. Run supabase/migrations/035_interactive_videos.sql, then retry.';

export type InteractiveCueCommand = 'sniff' | 'mouth_open' | 'tongue_out';

export interface InteractiveVideoCue {
  id: string;
  videoId: string;
  timeMs: number;
  /** Set for persistent cues with a timeline end; null = quick cue or legacy persistent. */
  endTimeMs: number | null;
  commandType: InteractiveCueCommand;
  persistent: boolean;
  sortOrder: number;
}

export interface InteractiveVideo {
  id: string;
  title: string;
  description: string | null;
  storagePath: string;
  durationSeconds: number | null;
  createdAt: string;
  cues: InteractiveVideoCue[];
}

export interface InteractiveVideoSummary {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  createdAt: string;
  cueCount: number;
}

export interface InteractiveVideoInput {
  title: string;
  description: string | null;
  durationSeconds?: number | null;
}

export interface InteractiveCueInput {
  timeMs: number;
  endTimeMs?: number | null;
  commandType: InteractiveCueCommand;
  persistent: boolean;
  sortOrder?: number;
}

type DbInteractiveVideo = {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  duration_seconds: number | null;
  created_at: string;
};

type DbInteractiveCue = {
  id: string;
  video_id: string;
  time_ms: number;
  end_time_ms: number | null;
  command_type: InteractiveCueCommand;
  persistent: boolean;
  sort_order: number;
};

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.interactive_videos'")
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

function mapCue(row: DbInteractiveCue): InteractiveVideoCue {
  return {
    id: row.id,
    videoId: row.video_id,
    timeMs: row.time_ms,
    endTimeMs: row.end_time_ms ?? null,
    commandType: row.command_type,
    persistent: row.persistent,
    sortOrder: row.sort_order,
  };
}

function validateCueInputs(
  cues: InteractiveCueInput[],
): { ok: true } | { ok: false; error: string } {
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const label = `Cue ${i + 1}`;
    if (cue.persistent) {
      if (cue.endTimeMs == null) {
        return {
          ok: false,
          error: `${label}: persistent cues need an end time on the timeline.`,
        };
      }
      if (cue.endTimeMs <= cue.timeMs) {
        return { ok: false, error: `${label}: end time must be after start time.` };
      }
    } else if (cue.endTimeMs != null && cue.endTimeMs <= cue.timeMs) {
      return { ok: false, error: `${label}: end time must be after start time.` };
    }
  }
  return { ok: true };
}

function mapVideo(
  row: DbInteractiveVideo,
  cues: InteractiveVideoCue[] = [],
): InteractiveVideo {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    storagePath: row.storage_path,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    cues: cues.sort((a, b) => a.timeMs - b.timeMs || a.sortOrder - b.sortOrder),
  };
}

export function interactiveVideoStoragePath(videoId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${videoId}/${safe}`;
}

export async function getInteractiveVideoPlaybackUrl(
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data: publicData } = supabase.storage
    .from(INTERACTIVE_VIDEOS_BUCKET)
    .getPublicUrl(storagePath);

  if (publicData?.publicUrl) {
    return { ok: true, url: publicData.publicUrl };
  }

  const { data, error } = await supabase.storage
    .from(INTERACTIVE_VIDEOS_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'Could not get video URL.' };
  }
  return { ok: true, url: data.signedUrl };
}

async function fetchCuesForVideo(videoId: string): Promise<InteractiveVideoCue[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('interactive_video_cues')
    .select('*')
    .eq('video_id', videoId)
    .order('time_ms')
    .order('sort_order');

  if (error || !data) return [];
  return (data as DbInteractiveCue[]).map(mapCue);
}

export async function fetchInteractiveVideoSummaries(): Promise<
  { ok: true; videos: InteractiveVideoSummary[] } | { ok: false; error: string }
> {
  const all = await fetchAllInteractiveVideos();
  if (!all.ok) return all;
  return {
    ok: true,
    videos: all.videos.map((video) => ({
      id: video.id,
      title: video.title,
      description: video.description,
      durationSeconds: video.durationSeconds,
      createdAt: video.createdAt,
      cueCount: video.cues.length,
    })),
  };
}

export async function fetchAllInteractiveVideos(): Promise<
  { ok: true; videos: InteractiveVideo[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('interactive_videos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatDbError(error) };

  const rows = data as DbInteractiveVideo[];
  const videos: InteractiveVideo[] = [];
  for (const row of rows) {
    const cues = await fetchCuesForVideo(row.id);
    videos.push(mapVideo(row, cues));
  }
  return { ok: true, videos };
}

export async function fetchInteractiveVideo(
  videoId: string,
): Promise<{ ok: true; video: InteractiveVideo } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('interactive_videos')
    .select('*')
    .eq('id', videoId)
    .maybeSingle();

  if (error) return { ok: false, error: formatDbError(error) };
  if (!data) return { ok: false, error: 'Interactive video not found.' };

  const cues = await fetchCuesForVideo(videoId);
  return { ok: true, video: mapVideo(data as DbInteractiveVideo, cues) };
}

async function uploadVideoFile(
  storagePath: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.storage.from(INTERACTIVE_VIDEOS_BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: file.type || 'video/mp4',
  });
  if (error) return { ok: false, error: formatUploadError(error) };
  return { ok: true };
}

async function removeStorage(paths: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(INTERACTIVE_VIDEOS_BUCKET).remove(paths);
}

export async function createInteractiveVideo(
  input: InteractiveVideoInput,
  file: File,
): Promise<{ ok: true; video: InteractiveVideo } | { ok: false; error: string }> {
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' };
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, error: formatVideoSizeError(file.size) };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const videoId = crypto.randomUUID();
  const storagePath = interactiveVideoStoragePath(videoId, file.name);
  const uploaded = await uploadVideoFile(storagePath, file);
  if (!uploaded.ok) return uploaded;

  const { data, error } = await supabase
    .from('interactive_videos')
    .insert({
      id: videoId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      storage_path: storagePath,
      duration_seconds: input.durationSeconds ?? null,
    })
    .select('*')
    .single();

  if (error) {
    await removeStorage([storagePath]);
    return { ok: false, error: formatDbError(error) };
  }

  return { ok: true, video: mapVideo(data as DbInteractiveVideo, []) };
}

export async function updateInteractiveVideo(
  videoId: string,
  input: InteractiveVideoInput,
  options?: { file?: File },
): Promise<{ ok: true; video: InteractiveVideo } | { ok: false; error: string }> {
  if (!input.title.trim()) return { ok: false, error: 'Title is required.' };

  const existing = await fetchInteractiveVideo(videoId);
  if (!existing.ok) return existing;

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  let storagePath = existing.video.storagePath;
  const pathsToRemove: string[] = [];

  if (options?.file) {
    if (options.file.size > MAX_VIDEO_BYTES) {
      return { ok: false, error: formatVideoSizeError(options.file.size) };
    }
    const nextPath = interactiveVideoStoragePath(videoId, options.file.name);
    const uploaded = await uploadVideoFile(nextPath, options.file);
    if (!uploaded.ok) return uploaded;
    if (nextPath !== storagePath) pathsToRemove.push(storagePath);
    storagePath = nextPath;
  }

  const { data, error } = await supabase
    .from('interactive_videos')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      storage_path: storagePath,
      duration_seconds: input.durationSeconds ?? existing.video.durationSeconds,
    })
    .eq('id', videoId)
    .select('*')
    .single();

  if (error) return { ok: false, error: formatDbError(error) };
  if (pathsToRemove.length > 0) await removeStorage(pathsToRemove);

  return {
    ok: true,
    video: mapVideo(data as DbInteractiveVideo, existing.video.cues),
  };
}

export async function deleteInteractiveVideo(
  videoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existing = await fetchInteractiveVideo(videoId);
  if (!existing.ok) return existing;

  const { error } = await supabase.from('interactive_videos').delete().eq('id', videoId);
  if (error) return { ok: false, error: formatDbError(error) };

  await removeStorage([existing.video.storagePath]);
  return { ok: true };
}

export async function replaceInteractiveVideoCues(
  videoId: string,
  cues: InteractiveCueInput[],
): Promise<{ ok: true; cues: InteractiveVideoCue[] } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error: deleteError } = await supabase
    .from('interactive_video_cues')
    .delete()
    .eq('video_id', videoId);

  if (deleteError) return { ok: false, error: formatDbError(deleteError) };

  if (cues.length === 0) return { ok: true, cues: [] };

  const validated = validateCueInputs(cues);
  if (!validated.ok) return validated;

  const rows = cues.map((cue, index) => ({
    video_id: videoId,
    time_ms: Math.max(0, Math.round(cue.timeMs)),
    end_time_ms:
      cue.persistent && cue.endTimeMs != null
        ? Math.max(0, Math.round(cue.endTimeMs))
        : null,
    command_type: cue.commandType,
    persistent: cue.persistent,
    sort_order: cue.sortOrder ?? index,
  }));

  const { data, error } = await supabase
    .from('interactive_video_cues')
    .insert(rows)
    .select('*');

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true, cues: (data as DbInteractiveCue[]).map(mapCue) };
}

export const CUE_COMMAND_LABELS: Record<InteractiveCueCommand, string> = {
  sniff: 'Sniff your poppers',
  mouth_open: 'Open your mouth',
  tongue_out: 'Stick your tongue out',
};

export const CUE_KEEP_LABELS: Record<InteractiveCueCommand, string> = {
  sniff: 'Keep sniffing',
  mouth_open: 'Keep your mouth open',
  tongue_out: 'Keep your tongue out',
};
