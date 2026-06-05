/**
 * Patreon API v2 webhook — tier sync on membership changes.
 *
 * Event name: `X-Patreon-Event` header (data.type is always `member`).
 * Handled: members:create, members:update, members:delete,
 *   members:pledge:create, members:pledge:update, members:pledge:delete
 * Signature: `X-Patreon-Signature` HMAC-MD5 body + PATREON_WEBHOOK_SECRET
 *
 * Revoke: pledge/member delete, or patron_status declined/former/null without active tier.
 * Grant: patron_status active_patron + entitled tier title → sweetie | princess | slut.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  extractPatreonUserId,
  isPatreonWebhookMemberEvent,
  logPatreonTierDebug,
  resolveWebhookProfileUpdate,
  type PatreonWebhookPayload,
} from '../_shared/patreon.ts';

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

  let payload: PatreonWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const event = req.headers.get('x-patreon-event')?.trim() ?? '';
  if (Deno.env.get('PATREON_WEBHOOK_DEBUG') === '1' && event) {
    console.log('patreon-webhook', event);
  }

  if (!event || !isPatreonWebhookMemberEvent(event)) {
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const update = resolveWebhookProfileUpdate(event, payload);
  const patreonUserId = extractPatreonUserId(payload);

  if (update && patreonUserId) {
    logPatreonTierDebug('webhook', {
      event,
      patreonUserId,
      appTier: update.appTier,
      patreonStatus: update.patreonStatus,
    });
  }

  if (!update || !patreonUserId) {
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  await supabase
    .from('profiles')
    .update({
      patreon_user_id: patreonUserId,
      patreon_tier: update.appTier,
      patreon_status: update.patreonStatus,
      patreon_updated_at: new Date().toISOString(),
    })
    .eq('patreon_user_id', patreonUserId);

  return new Response(JSON.stringify({ received: true, event }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
