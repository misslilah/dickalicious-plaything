import {
  categoryImageStoragePath,
  uploadCategoryImage,
} from './videoStorage';

export const MAX_CATEGORY_IMAGE_BYTES = 2_000_000;

export function formatCategoryImageSizeError(fileSize: number): string {
  return `Image too large (${Math.round(fileSize / 1024)} KB). Max ${Math.round(MAX_CATEGORY_IMAGE_BYTES / 1024)} KB.`;
}

export function readCategoryImageFile(
  file: File,
  onLoad: (dataUrl: string) => void,
  onError: (message: string) => void,
): void {
  if (file.size > MAX_CATEGORY_IMAGE_BYTES) {
    onError(formatCategoryImageSizeError(file.size));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result === 'string') onLoad(result);
    else onError('Could not read image file.');
  };
  reader.onerror = () => onError('Could not read image file.');
  reader.readAsDataURL(file);
}

export function isCategoryImagePreview(url: string | undefined): url is string {
  return !!url && (url.startsWith('http') || url.startsWith('data:'));
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Upload data-URL images to Supabase Storage; pass through http(s) URLs. */
export async function resolveCategoryImageUrl(
  categoryId: string,
  imageUrl: string | undefined,
  fileName = 'image.jpg',
): Promise<{ ok: true; url: string | undefined } | { ok: false; error: string }> {
  if (!imageUrl) return { ok: true, url: undefined };
  if (!imageUrl.startsWith('data:')) return { ok: true, url: imageUrl };

  const blob = dataUrlToBlob(imageUrl);
  if (!blob) return { ok: false, error: 'Invalid image data.' };
  if (blob.size > MAX_CATEGORY_IMAGE_BYTES) {
    return { ok: false, error: formatCategoryImageSizeError(blob.size) };
  }

  const path = categoryImageStoragePath(categoryId, fileName);
  const uploaded = await uploadCategoryImage(path, blob, blob.type || 'image/jpeg');
  if (!uploaded.ok) return uploaded;
  return { ok: true, url: uploaded.publicUrl };
}
