import { uploadToSupabaseStorage } from './storageUploadWithProgress';
import { getSupabase } from './supabase';
import type { Task, TaskMediaType } from '../types';

export const TASK_MEDIA_BUCKET = 'task-media';

export const TASK_MEDIA_MIGRATION_HINT =
  'The task-media storage bucket is not set up yet. Run supabase/migrations/089_task_media.sql in the Supabase SQL Editor, then retry.';

export const MAX_TASK_MEDIA_BYTES = 100 * 1024 * 1024;

export const TASK_MEDIA_ACCEPT =
  'video/mp4,video/webm,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/m4a,audio/ogg,audio/webm';

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'ogg']);

export function taskMediaStoragePath(taskId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `tasks/${taskId}/${safe}`;
}

export function inferTaskMediaType(file: File): TaskMediaType | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext && VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (ext && AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return null;
}

export function taskHasTaskMedia(task: Task): boolean {
  const url = task.taskMediaUrl?.trim();
  return Boolean(url) && (task.taskMediaType === 'video' || task.taskMediaType === 'audio');
}

/** Alias used by player UI. */
export const taskHasUploadedMedia = taskHasTaskMedia;

export function validateTaskMediaFile(
  file: File,
): { ok: true; mediaType: TaskMediaType } | { ok: false; error: string } {
  const mediaType = inferTaskMediaType(file);
  if (!mediaType) {
    return {
      ok: false,
      error: 'Choose a video (mp4, webm) or audio (mp3, wav, m4a, ogg) file.',
    };
  }
  if (file.size > MAX_TASK_MEDIA_BYTES) {
    return { ok: false, error: 'File too large (max 100 MB).' };
  }
  return { ok: true, mediaType };
}

export function getTaskMediaPublicUrl(storagePath: string): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = supabase.storage.from(TASK_MEDIA_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl || null;
}

export function storagePathFromTaskMediaUrl(url: string): string | null {
  const marker = `/object/public/${TASK_MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

function formatUploadError(message: string): string {
  if (/bucket not found/i.test(message)) return TASK_MEDIA_MIGRATION_HINT;
  return message;
}

export async function uploadTaskMediaFile(
  storagePath: string,
  file: File,
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  if (file.size > MAX_TASK_MEDIA_BYTES) {
    return { ok: false, error: 'File too large (max 100 MB).' };
  }

  const mediaType = inferTaskMediaType(file);
  if (!mediaType) {
    return {
      ok: false,
      error: 'Unsupported file type. Use mp4/webm video or mp3/wav/m4a/ogg audio.',
    };
  }

  const result = await uploadToSupabaseStorage({
    bucket: TASK_MEDIA_BUCKET,
    storagePath,
    file,
    contentType: file.type || (mediaType === 'video' ? 'video/mp4' : 'audio/mpeg'),
    upsert: true,
  });

  if (!result.ok) return { ok: false, error: formatUploadError(result.error) };

  const publicUrl = getTaskMediaPublicUrl(storagePath);
  if (!publicUrl) {
    return { ok: false, error: 'Upload succeeded but URL is unavailable.' };
  }

  return { ok: true, publicUrl };
}

export async function uploadTaskMedia(
  taskId: string,
  file: File,
  mediaType: TaskMediaType,
): Promise<
  { ok: true; url: string; mediaType: TaskMediaType } | { ok: false; error: string }
> {
  const validated = validateTaskMediaFile(file);
  if (!validated.ok) return validated;
  if (validated.mediaType !== mediaType) {
    return { ok: false, error: 'Media type does not match the selected file.' };
  }

  const storagePath = taskMediaStoragePath(taskId, file.name);
  const uploaded = await uploadTaskMediaFile(storagePath, file);
  if (!uploaded.ok) return uploaded;
  return { ok: true, url: uploaded.publicUrl, mediaType: validated.mediaType };
}

export async function deleteTaskMediaByUrl(
  url: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const storagePath = storagePathFromTaskMediaUrl(url ?? '');
  if (!storagePath) return { ok: true };
  return deleteTaskMediaFile(storagePath);
}

export async function deleteTaskMediaFile(
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage.from(TASK_MEDIA_BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function applyTaskMediaOnSave(
  task: Task,
  options: {
    pendingFile: File | null;
    clearMedia: boolean;
    previousTask?: Task | null;
  },
): Promise<{ ok: true; task: Task } | { ok: false; error: string }> {
  let next: Task = { ...task };

  if (options.clearMedia) {
    const prevUrl = options.previousTask?.taskMediaUrl ?? task.taskMediaUrl;
    if (prevUrl) {
      const path = storagePathFromTaskMediaUrl(prevUrl);
      if (path) await deleteTaskMediaFile(path);
    }
    next = { ...next, taskMediaUrl: undefined, taskMediaType: undefined };
    return { ok: true, task: next };
  }

  if (!options.pendingFile) {
    return { ok: true, task: next };
  }

  if (!task.id?.trim()) {
    return { ok: false, error: 'Task id is required before uploading media.' };
  }

  const mediaType = inferTaskMediaType(options.pendingFile);
  if (!mediaType) {
    return {
      ok: false,
      error: 'Unsupported file type. Use mp4/webm video or mp3/wav/m4a/ogg audio.',
    };
  }

  const prevUrl = options.previousTask?.taskMediaUrl;
  if (prevUrl) {
    const oldPath = storagePathFromTaskMediaUrl(prevUrl);
    if (oldPath) await deleteTaskMediaFile(oldPath);
  }

  const path = taskMediaStoragePath(task.id, options.pendingFile.name);
  const uploaded = await uploadTaskMediaFile(path, options.pendingFile);
  if (!uploaded.ok) return uploaded;

  next = {
    ...next,
    taskMediaUrl: uploaded.publicUrl,
    taskMediaType: mediaType,
  };
  return { ok: true, task: next };
}
