import type { GifBankEntry } from './gifBank';

const GIF_BANK_PREVIEW_EVENT = 'gif-bank-preview';
const GIF_BANK_PREVIEW_CLEAR_EVENT = 'gif-bank-preview-clear';

export function previewGifAsBackground(entry: GifBankEntry): void {
  window.dispatchEvent(
    new CustomEvent<GifBankEntry>(GIF_BANK_PREVIEW_EVENT, { detail: entry }),
  );
}

export function clearGifBankPreview(): void {
  window.dispatchEvent(new CustomEvent(GIF_BANK_PREVIEW_CLEAR_EVENT));
}

export function subscribeGifBankPreview(
  onPreview: (entry: GifBankEntry) => void,
  onClear?: () => void,
): () => void {
  const handlePreview = (event: Event) => {
    onPreview((event as CustomEvent<GifBankEntry>).detail);
  };
  const handleClear = () => onClear?.();

  window.addEventListener(GIF_BANK_PREVIEW_EVENT, handlePreview);
  window.addEventListener(GIF_BANK_PREVIEW_CLEAR_EVENT, handleClear);

  return () => {
    window.removeEventListener(GIF_BANK_PREVIEW_EVENT, handlePreview);
    window.removeEventListener(GIF_BANK_PREVIEW_CLEAR_EVENT, handleClear);
  };
}
