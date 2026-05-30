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

export type GifAppearanceIntervalUnit = 'seconds' | 'minutes';

export const GIF_APPEARANCE_MIN_MS = 1_000;
export const GIF_APPEARANCE_MAX_MS = 60 * 60 * 1_000;
export const DEFAULT_GIF_APPEARANCE_MIN_MS = 5 * 60 * 1_000;
export const DEFAULT_GIF_APPEARANCE_MAX_MS = 10 * 60 * 1_000;
export const DEFAULT_ROTATION_OPACITY = 0.03;
export const ROTATION_OPACITY_MIN = 0;
export const ROTATION_OPACITY_MAX = 1;

export interface GifBankAppearanceSettings {
  minIntervalMs: number;
  maxIntervalMs: number;
  rotationOpacity: number;
}

export const DEFAULT_GIF_BANK_APPEARANCE_SETTINGS: GifBankAppearanceSettings = {
  minIntervalMs: DEFAULT_GIF_APPEARANCE_MIN_MS,
  maxIntervalMs: DEFAULT_GIF_APPEARANCE_MAX_MS,
  rotationOpacity: DEFAULT_ROTATION_OPACITY,
};

const GIF_BANK_MIGRATION_HINT =
  'GIF bank is not set up yet. In Supabase SQL Editor, run supabase/migrations/020_gif_bank.sql and 021_gif_bank_storage.sql, then retry.';

const GIF_BANK_SETTINGS_MIGRATION_HINT =
  'GIF appearance settings are not set up yet. In Supabase SQL Editor, run supabase/migrations/022_gif_bank_appearance_settings.sql and 023_gif_bank_opacity.sql, then retry.';

const GIF_BANK_BUCKET_HINT =
  'The gif-bank storage bucket is not set up yet. In Supabase SQL Editor, run supabase/migrations/021_gif_bank_storage.sql, then retry the upload.';

type DbGifBank = {
  id: string;
  title: string | null;
  storage_path: string;
  created_at: string;
};

type DbGifBankSettings = {
  min_interval_ms: number;
  max_interval_ms: number;
  rotation_opacity?: number;
};

const GIF_BANK_SETTINGS_CHANGED_EVENT = 'gif-bank-settings-changed';
const GIF_BANK_CATALOG_CHANGED_EVENT = 'gif-bank-catalog-changed';

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

function formatGifBankSettingsDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.gif_bank_settings'")
  ) {
    return GIF_BANK_SETTINGS_MIGRATION_HINT;
  }
  return message;
}

export function isFixedAppearanceInterval(settings: GifBankAppearanceSettings): boolean {
  return settings.minIntervalMs === settings.maxIntervalMs;
}

export function msToAppearanceParts(
  ms: number,
): { value: number; unit: GifAppearanceIntervalUnit } {
  if (ms % 60_000 === 0 && ms >= 60_000) {
    return { value: ms / 60_000, unit: 'minutes' };
  }
  return { value: ms / 1_000, unit: 'seconds' };
}

export function appearancePartsToMs(
  value: number,
  unit: GifAppearanceIntervalUnit,
): number {
  return unit === 'minutes' ? value * 60_000 : value * 1_000;
}

export function validateAppearanceSettings(
  minMs: number,
  maxMs: number,
): string | null {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return 'Enter valid numbers.';
  }
  if (minMs < GIF_APPEARANCE_MIN_MS || maxMs > GIF_APPEARANCE_MAX_MS) {
    return 'Intervals must be between 1 second and 60 minutes.';
  }
  if (minMs > maxMs) {
    return 'Minimum cannot be greater than maximum.';
  }
  return null;
}

export function validateRotationOpacity(opacity: number): string | null {
  if (!Number.isFinite(opacity)) {
    return 'Enter a valid opacity.';
  }
  if (opacity < ROTATION_OPACITY_MIN || opacity > ROTATION_OPACITY_MAX) {
    return 'Opacity must be between 0% and 100%.';
  }
  return null;
}

export function validateGifBankAppearanceSettings(
  settings: GifBankAppearanceSettings,
): string | null {
  const intervalError = validateAppearanceSettings(
    settings.minIntervalMs,
    settings.maxIntervalMs,
  );
  if (intervalError) return intervalError;
  return validateRotationOpacity(settings.rotationOpacity);
}

export function randomAppearanceIntervalMs(settings: GifBankAppearanceSettings): number {
  const { minIntervalMs, maxIntervalMs } = settings;
  if (minIntervalMs >= maxIntervalMs) return minIntervalMs;
  return minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs);
}

export function notifyGifBankSettingsChanged(): void {
  window.dispatchEvent(new CustomEvent(GIF_BANK_SETTINGS_CHANGED_EVENT));
}

export function subscribeGifBankSettingsChanged(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(GIF_BANK_SETTINGS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(GIF_BANK_SETTINGS_CHANGED_EVENT, handler);
}

export function notifyGifBankCatalogChanged(): void {
  window.dispatchEvent(new CustomEvent(GIF_BANK_CATALOG_CHANGED_EVENT));
}

export function subscribeGifBankCatalogChanged(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(GIF_BANK_CATALOG_CHANGED_EVENT, handler);
  return () => window.removeEventListener(GIF_BANK_CATALOG_CHANGED_EVENT, handler);
}

function mapGifBankSettings(row: DbGifBankSettings): GifBankAppearanceSettings {
  return {
    minIntervalMs: row.min_interval_ms,
    maxIntervalMs: row.max_interval_ms,
    rotationOpacity:
      typeof row.rotation_opacity === 'number'
        ? row.rotation_opacity
        : DEFAULT_ROTATION_OPACITY,
  };
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

export async function fetchGifBankAppearanceSettings(): Promise<
  { ok: true; settings: GifBankAppearanceSettings } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('gif_bank_settings')
    .select('min_interval_ms, max_interval_ms, rotation_opacity')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    if (
      error.code === 'PGRST205' ||
      (error.message ?? '').includes("Could not find the table 'public.gif_bank_settings'")
    ) {
      return { ok: true, settings: DEFAULT_GIF_BANK_APPEARANCE_SETTINGS };
    }
    return { ok: false, error: formatGifBankSettingsDbError(error) };
  }

  if (!data) {
    return { ok: true, settings: DEFAULT_GIF_BANK_APPEARANCE_SETTINGS };
  }

  return { ok: true, settings: mapGifBankSettings(data as DbGifBankSettings) };
}

export async function updateGifBankAppearanceSettings(
  settings: GifBankAppearanceSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validationError = validateGifBankAppearanceSettings(settings);
  if (validationError) return { ok: false, error: validationError };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.from('gif_bank_settings').upsert(
    {
      id: 1,
      min_interval_ms: settings.minIntervalMs,
      max_interval_ms: settings.maxIntervalMs,
      rotation_opacity: settings.rotationOpacity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) return { ok: false, error: formatGifBankSettingsDbError(error) };
  notifyGifBankSettingsChanged();
  return { ok: true };
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
  notifyGifBankCatalogChanged();
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
  notifyGifBankCatalogChanged();
  return { ok: true };
}
