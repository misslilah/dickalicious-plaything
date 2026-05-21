import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, mapPatreonTierTitle, type AppPatreonTier } from '../_shared/patreon.ts';

/** Verify Patreon webhook signature (HMAC-MD5). */
async function verifySignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'MD5' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex === signature;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const webhookSecret = Deno.env.get('PATREON_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  const rawBody = await req.text();
  const signature = req.headers.get('x-patreon-signature');

  if (webhookSecret) {
    const valid = await verifySignature(rawBody, signature, webhookSecret);
    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    console.warn('PATREON_WEBHOOK_SECRET not set — skipping signature verification (dev only).');
  }

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 503 });
  }

  let payload: {
    data?: {
      type?: string;
      attributes?: Record<string, unknown>;
      relationships?: Record<string, unknown>;
    };
    included?: { type: string; attributes?: { title?: string; email?: string } }[];
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const eventType = payload?.data?.type ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  const tierTitles = (payload.included ?? [])
    .filter((x) => x.type === 'tier' || x.type === 'reward')
    .map((x) => x.attributes?.title ?? '')
    .filter(Boolean);

  const mapped = tierTitles
    .map(mapPatreonTierTitle)
    .filter((t): t is AppPatreonTier => t != null);

  const appTier: AppPatreonTier | null =
    mapped.includes('slut') ? 'slut' : mapped.includes('princess') ? 'princess' : mapped.includes('sweetie') ? 'sweetie' : null;

  const isActive =
    eventType.includes('pledge') &&
    !eventType.includes('delete') &&
    !eventType.includes('cancel');

  const patreonUserId =
    (payload.data?.relationships as { user?: { data?: { id?: string } } })?.user?.data?.id ??
    null;

  if (patreonUserId && (isActive || eventType.includes('delete') || eventType.includes('cancel'))) {
    await supabase
      .from('profiles')
      .update({
        patreon_user_id: patreonUserId,
        patreon_tier: isActive ? appTier : null,
        patreon_status: isActive && appTier ? 'active' : 'cancelled',
        patreon_updated_at: new Date().toISOString(),
      })
      .eq('patreon_user_id', patreonUserId);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
