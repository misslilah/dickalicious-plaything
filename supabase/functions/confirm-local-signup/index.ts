import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const LOCAL_SUFFIX = '@local.app';

function isLocalAppEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith(LOCAL_SUFFIX) && e.length > LOCAL_SUFFIX.length;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'not_configured' }, 503);
  }

  let body: { email?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!isLocalAppEmail(email)) {
    return jsonResponse({ error: 'invalid_email' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = (body.userId ?? '').trim();
  if (userId) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) {
      return jsonResponse({ error: 'user_not_found' }, 404);
    }
    if ((data.user.email ?? '').toLowerCase() !== email) {
      return jsonResponse({ error: 'email_mismatch' }, 403);
    }
    if (data.user.email_confirmed_at) {
      return jsonResponse({ ok: true, already_confirmed: true }, 200);
    }
  } else {
    let page = 1;
    let found: { id: string; email_confirmed_at?: string | null } | null =
      null;
    while (!found) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) {
        console.error('listUsers failed', error);
        return jsonResponse({ error: 'lookup_failed' }, 500);
      }
      const match = data.users.find(
        (u) => (u.email ?? '').toLowerCase() === email,
      );
      if (match) {
        found = match;
        break;
      }
      if (data.users.length < 200) break;
      page += 1;
      if (page > 50) break;
    }
    if (!found) {
      return jsonResponse({ error: 'user_not_found' }, 404);
    }
    userId = found.id;
    if (found.email_confirmed_at) {
      return jsonResponse({ ok: true, already_confirmed: true }, 200);
    }
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    userId,
    { email_confirm: true },
  );
  if (updateError) {
    console.error('updateUserById failed', updateError);
    return jsonResponse({ error: 'confirm_failed' }, 500);
  }

  return jsonResponse({ ok: true }, 200);
});
