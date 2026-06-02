import { getSupabase, normalizeSupabaseUrl } from './supabase';

export type UploadProgressCallback = (percent: number) => void;

export interface StorageUploadOptions {
  bucket: string;
  storagePath: string;
  file: Blob;
  contentType?: string;
  upsert?: boolean;
  onProgress?: UploadProgressCallback;
}

function trimEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

function parseStorageUploadError(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText) as {
      message?: string;
      error?: string;
      statusCode?: string;
    };
    if (body.message) return body.message;
    if (typeof body.error === 'string') return body.error;
  } catch {
    /* ignore */
  }
  return xhr.statusText || `Upload failed (${xhr.status}).`;
}

/**
 * Upload to Supabase Storage with XMLHttpRequest so upload progress is available.
 * Mirrors the browser FormData upload used by @supabase/storage-js for Blob/File bodies.
 */
export async function uploadToSupabaseStorage(
  options: StorageUploadOptions,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  const baseUrl = trimEnv(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const apiKey = trimEnv(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

  if (!supabase || !baseUrl || !apiKey) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const cleanPath = options.storagePath
    .replace(/^\/|\/$/g, '')
    .replace(/\/+/g, '/');
  const objectPath = `${options.bucket}/${cleanPath.replace(/^\/+/, '')}`;
  const uploadUrl = `${normalizeSupabaseUrl(baseUrl)}/storage/v1/object/${objectPath}`;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? apiKey;

  const formData = new FormData();
  formData.append('cacheControl', '3600');
  formData.append('', options.file);

  options.onProgress?.(0);

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', apiKey);
    if (options.upsert !== false) {
      xhr.setRequestHeader('x-upsert', 'true');
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      options.onProgress(percent);
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(100);
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, error: parseStorageUploadError(xhr) });
    });

    xhr.addEventListener('error', () => {
      resolve({ ok: false, error: 'Upload failed (network error).' });
    });

    xhr.addEventListener('abort', () => {
      resolve({ ok: false, error: 'Upload cancelled.' });
    });

    xhr.send(formData);
  });
}
