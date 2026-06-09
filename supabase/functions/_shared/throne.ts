export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-throne-webhook-secret, x-throne-signature',
};

export type ParsedThroneGift = {
  eventType: string;
  gifterName: string | null;
  itemName: string | null;
  amountCents: number | null;
  currency: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readAmountCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 100 ? Math.round(value) : Math.round(value * 100);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed >= 100 ? Math.round(parsed) : Math.round(parsed * 100);
  }
  return null;
}

/** Best-effort parser — Throne payload format is not fully documented publicly. */
export function parseThroneWebhookPayload(body: unknown): ParsedThroneGift {
  const root =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;
  const gift =
    data.gift && typeof data.gift === 'object'
      ? (data.gift as Record<string, unknown>)
      : data;

  const eventType =
    readString(root.event) ??
    readString(root.type) ??
    readString(data.event) ??
    readString(data.type) ??
    'gift';

  const gifterName =
    readString(gift.gifter_name) ??
    readString(gift.gifterName) ??
    readString(gift.username) ??
    readString(gift.name) ??
    readString(data.gifter_name) ??
    readString(data.username) ??
    readString(data.name);

  const itemName =
    readString(gift.item_name) ??
    readString(gift.itemName) ??
    readString(gift.product_name) ??
    readString(gift.gift_name) ??
    readString(gift.title) ??
    readString(data.item_name) ??
    readString(data.product_name) ??
    readString(data.title) ??
    readString(root.message) ??
    readString(data.message) ??
    readString(root.text) ??
    readString(data.text);

  const amountCents =
    readAmountCents(gift.amount_cents) ??
    readAmountCents(gift.amountCents) ??
    readAmountCents(gift.amount) ??
    readAmountCents(gift.value) ??
    readAmountCents(data.amount_cents) ??
    readAmountCents(data.amount) ??
    readAmountCents(data.value);

  const currency =
    readString(gift.currency) ??
    readString(data.currency) ??
    'USD';

  return { eventType, gifterName, itemName, amountCents, currency };
}

export function extractWebhookSecret(req: Request, url: URL): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || null;
  }
  return (
    req.headers.get('x-throne-webhook-secret')?.trim() ||
    req.headers.get('x-throne-signature')?.trim() ||
    url.searchParams.get('token')?.trim() ||
    null
  );
}
