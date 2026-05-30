import type { GifBankEntry } from './gifBank';

const GIF_BANK_PREVIEW_EVENT = 'gif-bank-preview';
const GIF_BANK_PREVIEW_CLEAR_EVENT = 'gif-bank-preview-clear';

export const GIF_BANK_PREVIEW_OPACITY = 0.3;

export interface GifBankPreviewDetail {
  entry: GifBankEntry;
  opacity: number;
}

export function previewGifAsBackground(
  entry: GifBankEntry,
  opacity = GIF_BANK_PREVIEW_OPACITY,
): void {
  window.dispatchEvent(
    new CustomEvent<GifBankPreviewDetail>(GIF_BANK_PREVIEW_EVENT, {
      detail: { entry, opacity },
    }),
  );
}

export function clearGifBankPreview(): void {
  window.dispatchEvent(new CustomEvent(GIF_BANK_PREVIEW_CLEAR_EVENT));
}

export function subscribeGifBankPreview(
  onPreview: (detail: GifBankPreviewDetail) => void,
  onClear?: () => void,
): () => void {
  const handlePreview = (event: Event) => {
    onPreview((event as CustomEvent<GifBankPreviewDetail>).detail);
  };
  const handleClear = () => onClear?.();

  window.addEventListener(GIF_BANK_PREVIEW_EVENT, handlePreview);
  window.addEventListener(GIF_BANK_PREVIEW_CLEAR_EVENT, handleClear);

  return () => {
    window.removeEventListener(GIF_BANK_PREVIEW_EVENT, handlePreview);
    window.removeEventListener(GIF_BANK_PREVIEW_CLEAR_EVENT, handleClear);
  };
}
