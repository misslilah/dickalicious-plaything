import { getSupabase } from './supabase';
import {
  uploadToSupabaseStorage,
  type UploadProgressCallback,
} from './storageUploadWithProgress';

const VIDEOS_BUCKET = 'videos';
const CATEGORY_IMAGES_BUCKET = 'category-images';
const BADGE_IMAGES_BUCKET = 'badge-images';

const BADGE_IMAGES_BUCKET_HINT =
  'The badge-images storage bucket is not set up yet. In Supabase SQL Editor, run supabase/migrations/018_badge_images_storage.sql (or supabase/storage_setup.sql), then retry the upload.';

function formatBadgeImageUploadError(error: { message?: string }): string {
  const message = error.message ?? 'Upload failed.';
  if (/bucket not found/i.test(message)) {
    return BADGE_IMAGES_BUCKET_HINT;
  }
  return message;
}

const envMax = import.meta.env.VITE_MAX_VIDEO_BYTES;
const parsedMax = envMax ? Number(envMax) : NaN;

/** Maximum upload size (client validation). Default 2 GB. */
export const MAX_VIDEO_BYTES = Number.isFinite(parsedMax) && parsedMax > 0
  ? parsedMax
  : 2 * 1024 * 1024 * 1024;

export const MAX_VIDEO_SIZE_LABEL =
  MAX_VIDEO_BYTES >= 1024 * 1024 * 1024
    ? `${(MAX_VIDEO_BYTES / (1024 * 1024 * 1024)).toFixed(0)} GB`
    : `${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB`;

export function formatVideoSizeError(fileSize: number): string {
  return `Video too large (${formatMb(fileSize)}). Maximum ${MAX_VIDEO_SIZE_LABEL} per file.`;
}

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads duration from a local video file via browser metadata (best-effort). */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : null;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

export function videoStoragePath(videoId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${videoId}/${safe}`;
}

export async function uploadVideoFile(
  storagePath: string,
  file: Blob,
  mimeType: string,
  onProgress?: UploadProgressCallback,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return uploadToSupabaseStorage({
    bucket: VIDEOS_BUCKET,
    storagePath,
    file,
    contentType: mimeType,
    upsert: true,
    onProgress,
  });
}

export async function deleteVideoFile(
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage.from(VIDEOS_BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getVideoPlaybackUrl(
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data: publicData } = supabase.storage
    .from(VIDEOS_BUCKET)
    .getPublicUrl(storagePath);

  if (publicData?.publicUrl) {
    return { ok: true, url: publicData.publicUrl };
  }

  const { data, error } = await supabase.storage
    .from(VIDEOS_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'Could not get video URL.' };
  }
  return { ok: true, url: data.signedUrl };
}

export function categoryImageStoragePath(categoryId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${categoryId}/${safe}`;
}

export async function uploadCategoryImage(
  storagePath: string,
  file: Blob,
  mimeType: string,
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage
    .from(CATEGORY_IMAGES_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) return { ok: false, error: error.message };

  const { data } = supabase.storage.from(CATEGORY_IMAGES_BUCKET).getPublicUrl(storagePath);
  return { ok: true, publicUrl: data.publicUrl };
}

export function badgeImageStoragePath(badgeId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${badgeId}/${safe}`;
}

export async function uploadBadgeImage(
  storagePath: string,
  file: Blob,
  mimeType: string,
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage
    .from(BADGE_IMAGES_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) return { ok: false, error: formatBadgeImageUploadError(error) };

  const { data } = supabase.storage.from(BADGE_IMAGES_BUCKET).getPublicUrl(storagePath);
  return { ok: true, publicUrl: data.publicUrl };
}
