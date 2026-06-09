/**
 * Throne gift webhook receiver.
 *
 * Configure in Throne dashboard → Alerts & Integrations → Webhook (if available),
 * or relay manually from admin / automation bridge.
 *
 * Auth: THRONE_WEBHOOK_SECRET via Authorization: Bearer, X-Throne-Webhook-Secret,
 * X-Throne-Signature, or ?token= query param.
 *
 * Deploy: supabase functions deploy throne-webhook --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  extractWebhookSecret,
  parseThroneWebhookPayload,
} from '../_shared/throne.ts';

const jsonHeaders = { 'Content-Type': 'application/json', ...corsHeaders };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const webhookSecret = Deno.env.get('THRONE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    return jsonResponse({
      ok: true,
      service: 'throne-webhook',
      secretConfigured: Boolean(webhookSecret),
      supabaseConfigured: Boolean(supabaseUrl && serviceKey),
      hint: 'Deploy with --no-verify-jwt. Throne must POST JSON to this URL.',
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const providedSecret = extractWebhookSecret(req, url);
  if (webhookSecret) {
    if (!providedSecret || providedSecret !== webhookSecret) {
      console.warn('throne-webhook rejected: invalid secret', {
        hasProvidedSecret: Boolean(providedSecret),
        viaQueryToken: Boolean(url.searchParams.get('token')),
        viaAuthHeader: Boolean(req.headers.get('authorization')),
      });
      return jsonResponse({ error: 'Invalid webhook secret' }, 401);
    }
  } else {
    console.warn('THRONE_WEBHOOK_SECRET not set — skipping verification (dev only).');
  }

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Supabase not configured' }, 503);
  }

  const rawBody = await req.text();
  let payload: unknown;
  if (!rawBody.trim()) {
    payload = { _empty: true, _note: 'Empty webhook body (Throne test ping?)' };
  } else {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = {
        _raw: rawBody.slice(0, 4000),
        _parseError: 'Invalid JSON — stored raw body for debugging',
      };
    }
  }

  const parsed = parseThroneWebhookPayload(payload);
  console.log('throne-webhook received', {
    eventType: parsed.eventType,
    gifterName: parsed.gifterName,
    itemName: parsed.itemName,
  });

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: eventRow, error: insertError } = await supabase
    .from('throne_gift_events')
    .insert({
      event_type: parsed.eventType,
      gifter_name: parsed.gifterName,
      item_name: parsed.itemName,
      amount_cents: parsed.amountCents,
      currency: parsed.currency,
      payload,
    })
    .select('id')
    .single();

  if (insertError || !eventRow) {
    console.error('throne-webhook insert failed', insertError);
    const hint =
      insertError?.code === '42P01' || /does not exist/i.test(insertError?.message ?? '')
        ? 'Run migration 073_throne_payment_integration.sql in Supabase SQL Editor.'
        : undefined;
    return jsonResponse(
      {
        error: 'Failed to store event',
        detail: insertError?.message ?? 'Unknown insert error',
        hint,
      },
      500,
    );
  }

  const { data: matchResult, error: matchError } = await supabase.rpc(
    'match_throne_gift_to_pending',
    { p_gift_event_id: eventRow.id },
  );

  if (matchError) {
    console.error('throne-webhook match failed', matchError);
  }

  const matched =
    matchResult &&
    typeof matchResult === 'object' &&
    (matchResult as { matched?: boolean }).matched === true;

  return jsonResponse({
    received: true,
    eventId: eventRow.id,
    matched,
    match: matchResult ?? null,
  });
});
