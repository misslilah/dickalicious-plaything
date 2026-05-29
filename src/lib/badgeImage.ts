import { badgeImageStoragePath, uploadBadgeImage } from './videoStorage';

export const MAX_BADGE_IMAGE_BYTES = 200_000;

export function formatBadgeImageSizeError(fileSize: number): string {
  return `Image too large (${Math.round(fileSize / 1024)} KB). Max ${Math.round(MAX_BADGE_IMAGE_BYTES / 1024)} KB.`;
}

export function readBadgeImageFile(
  file: File,
  onLoad: (dataUrl: string) => void,
  onError: (message: string) => void,
): void {
  if (file.size > MAX_BADGE_IMAGE_BYTES) {
    onError(formatBadgeImageSizeError(file.size));
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

export function isBadgeImagePreview(url: string | undefined): url is string {
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

export async function resolveBadgeImageUrl(
  badgeId: string,
  imageUrl: string | undefined,
  fileName = 'badge.jpg',
): Promise<{ ok: true; url: string | undefined } | { ok: false; error: string }> {
  if (!imageUrl) return { ok: true, url: undefined };
  if (!imageUrl.startsWith('data:')) return { ok: true, url: imageUrl };

  const blob = dataUrlToBlob(imageUrl);
  if (!blob) return { ok: false, error: 'Invalid image data.' };
  if (blob.size > MAX_BADGE_IMAGE_BYTES) {
    return { ok: false, error: formatBadgeImageSizeError(blob.size) };
  }

  const path = badgeImageStoragePath(badgeId, fileName);
  const uploaded = await uploadBadgeImage(path, blob, blob.type || 'image/jpeg');
  if (!uploaded.ok) return uploaded;
  return { ok: true, url: uploaded.publicUrl };
}
