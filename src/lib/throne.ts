/** Creator Throne wishlist page (marketing link). */
export function getThronePageUrl(): string | null {
  const raw = (import.meta.env.VITE_THRONE_URL as string | undefined)?.trim();
  return raw || null;
}

export function isThronePageConfigured(): boolean {
  return getThronePageUrl() != null;
}
