import { uploadToSupabaseStorage } from './storageUploadWithProgress';
import { getSupabase } from './supabase';

export const TRAINING_VIDEOS_BUCKET = 'training-videos';
export const TRAINING_PROOF_PHOTOS_BUCKET = 'training-proof-photos';

export const TRAINING_STORAGE_MIGRATION_HINT =
  'Training storage buckets are not set up yet. Run supabase/migrations/071_training_blackmail.sql in the Supabase SQL Editor, then retry.';

export const MAX_TRAINING_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_PROOF_PHOTO_BYTES = 8 * 1024 * 1024;

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';

export function trainingVideoStoragePath(taskId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${taskId}/${safe}`;
}

export function trainingProofPhotoStoragePath(
  userId: string,
  taskId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${userId}/${taskId}/${Date.now()}_${safe}`;
}

function formatStorageError(message: string): string {
  if (/bucket not found/i.test(message)) return TRAINING_STORAGE_MIGRATION_HINT;
  return message;
}

export async function uploadTrainingVideo(
  storagePath: string,
  file: Blob,
  mimeType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (file.size > MAX_TRAINING_VIDEO_BYTES) {
    return { ok: false, error: 'Video too large (max 500 MB).' };
  }
  const result = await uploadToSupabaseStorage({
    bucket: TRAINING_VIDEOS_BUCKET,
    storagePath,
    file,
    contentType: mimeType,
    upsert: true,
  });
  if (!result.ok) return { ok: false, error: formatStorageError(result.error) };
  return { ok: true };
}

export async function uploadTrainingProofPhoto(
  storagePath: string,
  file: Blob,
  mimeType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (file.size > MAX_PROOF_PHOTO_BYTES) {
    return { ok: false, error: 'Photo too large (max 8 MB).' };
  }
  const result = await uploadToSupabaseStorage({
    bucket: TRAINING_PROOF_PHOTOS_BUCKET,
    storagePath,
    file,
    contentType: mimeType,
    upsert: false,
  });
  if (!result.ok) return { ok: false, error: formatStorageError(result.error) };
  return { ok: true };
}

export async function getTrainingVideoUrl(
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.storage
    .from(TRAINING_VIDEOS_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'Could not load training video.' };
  }
  return { ok: true, url: data.signedUrl };
}

export async function getTrainingProofPhotoUrl(
  storagePath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase.storage
    .from(TRAINING_PROOF_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? 'Could not load proof photo.' };
  }
  return { ok: true, url: data.signedUrl };
}

export async function deleteTrainingVideo(
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.storage
    .from(TRAINING_VIDEOS_BUCKET)
    .remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { IMAGE_ACCEPT as TRAINING_PROOF_IMAGE_ACCEPT, VIDEO_ACCEPT as TRAINING_VIDEO_ACCEPT };
