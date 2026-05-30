import { getSupabase } from './supabase';

export interface GifBankEntry {
  id: string;
  title: string | null;
  storagePath: string;
  url: string;
  createdAt: string;
}

const GIF_BANK_BUCKET = 'gif-bank';

export const MAX_GIF_BYTES = 5 * 1024 * 1024;

const GIF_BANK_MIGRATION_HINT =
  'GIF bank is not set up yet. In Supabase SQL Editor, run supabase/migrations/020_gif_bank.sql and 021_gif_bank_storage.sql, then retry.';

const GIF_BANK_BUCKET_HINT =
  'The gif-bank storage bucket is not set up yet. In Supabase SQL Editor, run supabase/migrations/021_gif_bank_storage.sql, then retry the upload.';

type DbGifBank = {
  id: string;
  title: string | null;
  storage_path: string;
  created_at: string;
};

function formatGifBankDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.gif_bank'")
  ) {
    return GIF_BANK_MIGRATION_HINT;
  }
  return message;
}

function formatGifUploadError(error: { message?: string }): string {
  const message = error.message ?? 'Upload failed.';
  if (/bucket not found/i.test(message)) {
    return GIF_BANK_BUCKET_HINT;
  }
  return message;
}

export function gifBankStoragePath(gifId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${gifId}/${safe}`;
}

export function getGifPublicUrl(storagePath: string): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = supabase.storage.from(GIF_BANK_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? null;
}

function mapGifBank(row: DbGifBank): GifBankEntry | null {
  const url = getGifPublicUrl(row.storage_path);
  if (!url) return null;
  return {
    id: row.id,
    title: row.title,
    storagePath: row.storage_path,
    url,
    createdAt: row.created_at,
  };
}

export async function fetchGifBank(): Promise<
  { ok: true; gifs: GifBankEntry[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('gif_bank')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatGifBankDbError(error) };

  const gifs = (data as DbGifBank[])
    .map(mapGifBank)
    .filter((entry): entry is GifBankEntry => entry != null);

  return { ok: true, gifs };
}

export async function uploadGifFile(
  storagePath: string,
  file: Blob,
  mimeType: string,
): Promise<{ ok: true; publicUrl: string } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage
    .from(GIF_BANK_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) return { ok: false, error: formatGifUploadError(error) };

  const publicUrl = getGifPublicUrl(storagePath);
  if (!publicUrl) return { ok: false, error: 'Upload succeeded but URL is unavailable.' };
  return { ok: true, publicUrl };
}

export async function deleteGifFile(
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage.from(GIF_BANK_BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function insertGifBankEntry(
  title: string | null,
  file: File,
): Promise<{ ok: true; entry: GifBankEntry } | { ok: false; error: string }> {
  if (file.type !== 'image/gif') {
    return { ok: false, error: 'Only GIF files (image/gif) are allowed.' };
  }
  if (file.size > MAX_GIF_BYTES) {
    return {
      ok: false,
      error: `GIF too large (${Math.round(file.size / (1024 * 1024))} MB). Max ${MAX_GIF_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const id = crypto.randomUUID();
  const path = gifBankStoragePath(id, file.name || 'animation.gif');
  const uploaded = await uploadGifFile(path, file, file.type || 'image/gif');
  if (!uploaded.ok) return uploaded;

  const { data, error } = await supabase
    .from('gif_bank')
    .insert({
      id,
      title: title?.trim() || null,
      storage_path: path,
    })
    .select('*')
    .single();

  if (error || !data) {
    await deleteGifFile(path);
    return {
      ok: false,
      error: error ? formatGifBankDbError(error) : 'Save failed.',
    };
  }

  const entry = mapGifBank(data as DbGifBank);
  if (!entry) {
    return { ok: false, error: 'Saved but public URL is unavailable.' };
  }
  return { ok: true, entry };
}

export async function deleteGifBankEntry(
  id: string,
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.from('gif_bank').delete().eq('id', id);
  if (error) return { ok: false, error: formatGifBankDbError(error) };

  const fileResult = await deleteGifFile(storagePath);
  if (!fileResult.ok) return fileResult;
  return { ok: true };
}
