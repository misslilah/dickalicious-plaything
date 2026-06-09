import { corsHeaders } from './throne.ts';

export type ThroneGiftCatalogItem = {
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  url: string;
  imageUrl?: string | null;
};

type ThronePageJson = {
  props?: {
    pageProps?: {
      fallback?: Record<string, unknown>;
    };
  };
};

type RawWishlistItem = {
  id?: string;
  name?: string;
  price?: number;
  currency?: string;
  quantity?: number;
  shipping?: number;
  link?: string;
  imgLink?: string;
  image?: string;
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Parse throne.com/u/name, full URL, or bare username. */
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

  return trimmed.replace(/^@/, '').split('/')[0]?.toLowerCase() || null;
}

/** Request body first, then Edge Function secrets (not VITE_* — client-only). */
export function resolveThroneUsername(requested?: string | null): string | null {
  const fromRequest = parseThroneUsername(requested);
  if (fromRequest) return fromRequest;

  return (
    parseThroneUsername(Deno.env.get('THRONE_PROFILE_URL')) ??
    parseThroneUsername(Deno.env.get('THRONE_USERNAME'))
  );
}

function buildThroneItemUrl(username: string, itemId: string): string {
  return `https://throne.com/u/${encodeURIComponent(username.toLowerCase())}/item/${encodeURIComponent(itemId)}`;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractNextDataJson(html: string): ThronePageJson | null {
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const jsonStart = start + marker.length;
  const end = html.indexOf('</script>', jsonStart);
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(jsonStart, end)) as ThronePageJson;
  } catch {
    return null;
  }
}

function findFallbackValue(
  fallback: Record<string, unknown>,
  needle: string,
): unknown {
  for (const [key, value] of Object.entries(fallback)) {
    if (key.includes(needle)) return value;
  }
  return undefined;
}

function findWishlistItems(
  fallback: Record<string, unknown>,
  userId: string | null,
): unknown {
  const direct = findFallbackValue(fallback, 'useWishlistItems');
  if (direct) return direct;

  if (userId) {
    const keyed = fallback[`public/wishlist/useWishlistItems/${userId}`];
    if (keyed) return keyed;
  }

  for (const [key, value] of Object.entries(fallback)) {
    if (
      key.includes('useWishlistItems') &&
      Array.isArray(value) &&
      value.length > 0
    ) {
      return value;
    }
  }

  return undefined;
}

function normalizeWishlistItems(
  raw: unknown,
  username: string,
): ThroneGiftCatalogItem[] {
  if (!Array.isArray(raw)) return [];

  const items: ThroneGiftCatalogItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as RawWishlistItem;
    const id = readString(item.id);
    const title = readString(item.name);
    const unitPrice = readNumber(item.price);
    if (!id || !title || unitPrice == null || unitPrice <= 0) continue;

    const quantity = Math.max(1, Math.round(readNumber(item.quantity) ?? 1));
    const shipping = Math.max(0, Math.round(readNumber(item.shipping) ?? 0));
    const priceCents = unitPrice * quantity + shipping;
    const currency = readString(item.currency)?.toUpperCase() ?? 'EUR';
    const url =
      readString(item.link) ??
      buildThroneItemUrl(username, id);
    const imageUrl = readString(item.imgLink) ?? readString(item.image);

    items.push({
      id,
      title,
      priceCents,
      currency,
      url,
      imageUrl,
    });
  }

  items.sort((a, b) => a.priceCents - b.priceCents || a.title.localeCompare(b.title));
  return items;
}

async function fetchThroneProfileHtml(username: string): Promise<string> {
  const slug = username.toLowerCase();
  const urls = [
    `https://throne.com/u/${encodeURIComponent(slug)}`,
    `https://throne.com/${encodeURIComponent(slug)}`,
  ];

  let lastError = 'Could not reach Throne.';
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (!response.ok) {
        if (response.status === 404) {
          lastError = `Throne profile not found for "${slug}" (${url}). Check the username.`;
        } else {
          lastError = `Throne returned HTTP ${response.status} for ${url}.`;
        }
        continue;
      }
      const html = await response.text();
      if (html.includes('__NEXT_DATA__')) return html;
      if (/not found|page doesn.?t exist|404/i.test(html)) {
        lastError = `Throne profile not found for "${slug}".`;
        continue;
      }
      lastError =
        'Throne page did not include embedded wishlist data (site layout may have changed).';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

/** Scrape public Throne profile JSON embedded in the wishlist page. May break if Throne changes layout. */
export async function fetchThroneWishlistGifts(
  username: string,
): Promise<{ username: string; gifts: ThroneGiftCatalogItem[] }> {
  const html = await fetchThroneProfileHtml(username);
  const nextData = extractNextDataJson(html);
  const fallback = nextData?.props?.pageProps?.fallback;
  if (!fallback || typeof fallback !== 'object') {
    throw new Error(
      'Could not parse Throne wishlist data. Throne may have changed their page format — use manual EUR entry.',
    );
  }

  const userInfo = findFallbackValue(fallback, 'useCreatorByUsername');
  const userId =
    userInfo &&
    typeof userInfo === 'object' &&
    readString((userInfo as { _id?: string })._id);

  const rawItems = findWishlistItems(fallback, userId);
  const gifts = normalizeWishlistItems(rawItems, username);
  if (gifts.length === 0) {
    throw new Error(
      'No Throne wishlist gifts found for this username. Add gifts on Throne or enter amount/URL manually.',
    );
  }

  return { username: username.toLowerCase(), gifts };
}
