/** Creator Throne wishlist page (marketing link). */
export function getThronePageUrl(): string | null {
  const raw = (import.meta.env.VITE_THRONE_URL as string | undefined)?.trim();
  return raw || null;
}

export function isThronePageConfigured(): boolean {
  return getThronePageUrl() != null;
}

/** Parse throne.com/u/name, full URL, u/name, or bare username. */
export function parseThroneUsername(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const uMatch = url.pathname.match(/\/u\/([^/?#]+)/i);
      if (uMatch?.[1]) return uMatch[1].toLowerCase();
      const rootMatch = url.pathname.match(/^\/([^/?#]+)/);
      if (rootMatch?.[1] && rootMatch[1] !== 'u') {
        return rootMatch[1].toLowerCase();
      }
    } catch {
      return null;
    }
    return null;
  }

  const withoutAt = trimmed.replace(/^@/, '');
  if (/^u\//i.test(withoutAt)) {
    return withoutAt.split('/')[1]?.toLowerCase() || null;
  }
  return withoutAt.split('/')[0]?.toLowerCase() || null;
}

/** Canonical public profile URL (always /u/{username}). */
export function buildThroneProfileUrl(username: string): string {
  return `https://throne.com/u/${encodeURIComponent(username.toLowerCase())}`;
}

/** Default Throne username from VITE_THRONE_URL for admin gift fetch. */
export function getThroneUsername(): string | null {
  return parseThroneUsername(getThronePageUrl());
}
