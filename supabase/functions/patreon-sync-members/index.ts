/**
 * Admin-only Patreon tier sync for linked users.
 *
 * Uses the creator access token to read campaign members and update profiles.
 * POST { userId?: string } — omit userId to sync all linked profiles.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  fetchCampaignMemberByPatreonUserId,
  fetchCampaignMembersByPatreonUserIdMap,
  getPatreonCreatorSyncConfig,
  logPatreonTierResolution,
  resolveCreatorAccessToken,
  resolveProfileSyncFromMember,
} from '../_shared/patreon.ts';

type LinkedProfile = {
  id: string;
  username: string;
  patreon_user_id: string;
  patreon_tier: string | null;
  patreon_status: string;
};

type SyncUserResult = {
  userId: string;
  username: string;
  patreonUserId: string;
  previousTier: string | null;
  previousStatus: string;
  tier: string | null;
  status: string;
  changed: boolean;
  lastSynced: string;
  error?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(
  req: Request,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Not signed in.' }, 401) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const anonKey =
    Deno.env.get('SUPABASE_ANON_KEY')?.trim() ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ??
    '';
  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      response: jsonResponse(
        { ok: false, error: 'Supabase is not configured on the server.' },
        503,
      ),
    };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Invalid session.' }, 401) };
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || !isAdmin) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Admin only.' }, 403) };
  }

  return { ok: true };
}

function profileChanged(
  profile: LinkedProfile,
  tier: string | null,
  status: string,
): boolean {
  return profile.patreon_tier !== tier || profile.patreon_status !== status;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    const { missingSecrets } = getPatreonCreatorSyncConfig();
    return jsonResponse({
      ok: missingSecrets.length === 0,
      missing: missingSecrets,
    }, missingSecrets.length === 0 ? 200 : 503);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;

  const { campaignId, missingSecrets } = getPatreonCreatorSyncConfig();
  if (missingSecrets.length > 0 || !campaignId) {
    return jsonResponse(
      {
        ok: false,
        error: 'Patreon creator sync is not configured.',
        missing: missingSecrets,
        hint:
          'Set PATREON_CREATOR_CAMPAIGN_ID and PATREON_CREATOR_ACCESS_TOKEN (or PATREON_CREATOR_REFRESH_TOKEN with PATREON_CLIENT_ID/SECRET). Creator token needs campaigns + campaigns.members scopes.',
      },
      503,
    );
  }

  let body: { userId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : '';

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: 'Supabase service role not configured.' }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let query = supabase
    .from('profiles')
    .select('id, username, patreon_user_id, patreon_tier, patreon_status')
    .not('patreon_user_id', 'is', null);

  if (targetUserId) {
    query = query.eq('id', targetUserId);
  }

  const { data: profiles, error: profilesError } = await query;
  if (profilesError) {
    return jsonResponse({ ok: false, error: profilesError.message }, 500);
  }

  const linkedProfiles = (profiles ?? []) as LinkedProfile[];
  if (targetUserId && linkedProfiles.length === 0) {
    return jsonResponse(
      {
        ok: false,
        error: 'User not found or Patreon is not linked for this account.',
      },
      404,
    );
  }

  if (linkedProfiles.length === 0) {
    return jsonResponse({
      ok: true,
      synced: 0,
      updated: 0,
      unchanged: 0,
      errors: [],
      results: [],
    });
  }

  let accessToken: string;
  try {
    accessToken = await resolveCreatorAccessToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ ok: false, error: message }, 502);
  }

  const now = new Date().toISOString();
  const results: SyncUserResult[] = [];
  const errors: { userId: string; username: string; error: string }[] = [];
  let updated = 0;

  const applySync = async (
    profile: LinkedProfile,
    tier: string | null,
    status: string,
  ): Promise<void> => {
    const changed = profileChanged(profile, tier, status);
    if (changed) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          patreon_tier: tier,
          patreon_status: status,
          patreon_updated_at: now,
        })
        .eq('id', profile.id);

      if (updateError) {
        errors.push({
          userId: profile.id,
          username: profile.username,
          error: updateError.message,
        });
        results.push({
          userId: profile.id,
          username: profile.username,
          patreonUserId: profile.patreon_user_id,
          previousTier: profile.patreon_tier,
          previousStatus: profile.patreon_status,
          tier,
          status,
          changed: false,
          lastSynced: now,
          error: updateError.message,
        });
        return;
      }
      updated++;
    } else {
      await supabase
        .from('profiles')
        .update({ patreon_updated_at: now })
        .eq('id', profile.id);
    }

    results.push({
      userId: profile.id,
      username: profile.username,
      patreonUserId: profile.patreon_user_id,
      previousTier: profile.patreon_tier,
      previousStatus: profile.patreon_status,
      tier,
      status,
      changed,
      lastSynced: now,
    });
  };

  try {
    if (targetUserId) {
      const profile = linkedProfiles[0];
      const { member, included } = await fetchCampaignMemberByPatreonUserId(
        accessToken,
        campaignId,
        profile.patreon_user_id,
      );

      if (!member) {
        logPatreonTierResolution('admin-sync-not-found', {
          userId: profile.id,
          patreonUserId: profile.patreon_user_id,
        });
        await applySync(profile, null, 'cancelled');
      } else {
        const sync = resolveProfileSyncFromMember(member, included);
        logPatreonTierResolution('admin-sync-user', {
          userId: profile.id,
          patreonUserId: profile.patreon_user_id,
          appTier: sync.appTier,
          patreonStatus: sync.patreonStatus,
        });
        await applySync(profile, sync.appTier, sync.patreonStatus);
      }
    } else {
      const memberMap = await fetchCampaignMembersByPatreonUserIdMap(accessToken, campaignId);

      for (const profile of linkedProfiles) {
        const match = memberMap.get(profile.patreon_user_id);
        if (!match) {
          await applySync(profile, null, 'cancelled');
          continue;
        }
        const sync = resolveProfileSyncFromMember(match.member, match.included);
        await applySync(profile, sync.appTier, sync.patreonStatus);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[patreon-sync-members]', message);
    return jsonResponse({ ok: false, error: message }, 502);
  }

  return jsonResponse({
    ok: true,
    synced: linkedProfiles.length,
    updated,
    unchanged: linkedProfiles.length - updated - errors.length,
    errors,
    results,
  });
});
