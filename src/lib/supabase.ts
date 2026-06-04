import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type SupabaseKeyKind = 'legacy-jwt' | 'publishable' | 'invalid';

export interface SupabaseConfigStatus {
  configured: boolean;
  issues: string[];
  keyKind: SupabaseKeyKind | null;
  urlHost: string | null;
}

function trimEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

export function normalizeSupabaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function detectSupabaseKeyKind(key: string): SupabaseKeyKind {
  const trimmed = key.trim();
  if (!trimmed) return 'invalid';
  if (trimmed.startsWith('sb_publishable_')) return 'publishable';
  if (trimmed.startsWith('eyJ')) return 'legacy-jwt';
  return 'invalid';
}

/** Validate env without exposing secret values. */
export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const url = trimEnv(rawUrl);
  const key = trimEnv(rawKey);
  const issues: string[] = [];

  if (!url) issues.push('VITE_SUPABASE_URL is missing.');
  if (!key) issues.push('VITE_SUPABASE_ANON_KEY is missing.');

  let urlHost: string | null = null;
  if (url) {
    if (url.endsWith('/')) {
      issues.push('VITE_SUPABASE_URL has a trailing slash — remove it.');
    }
    if (!/^https:\/\//i.test(url)) {
      issues.push('VITE_SUPABASE_URL must start with https:// (not http://).');
    }
    try {
      const parsed = new URL(normalizeSupabaseUrl(url));
      urlHost = parsed.host;
      if (!parsed.host.endsWith('.supabase.co')) {
        issues.push(
          'VITE_SUPABASE_URL host should look like xxxx.supabase.co (check for typos).',
        );
      }
    } catch {
      issues.push('VITE_SUPABASE_URL is not a valid URL.');
    }
    if (url.includes('supabase.com/dashboard') || url.includes('/project/')) {
      issues.push(
        'VITE_SUPABASE_URL looks like a dashboard link — use Project Settings → API → Project URL.',
      );
    }
  }

  const keyKind = key ? detectSupabaseKeyKind(key) : null;
  if (key) {
    if (key.startsWith('sb_secret_')) {
      issues.push(
        'VITE_SUPABASE_ANON_KEY looks like a secret/service key — use the anon or publishable key only.',
      );
    } else if (keyKind === 'invalid') {
      issues.push(
        'VITE_SUPABASE_ANON_KEY format not recognized — use the legacy anon key (starts with eyJ) or the publishable key (starts with sb_publishable_).',
      );
    } else if (key.length < 20) {
      issues.push('VITE_SUPABASE_ANON_KEY looks too short.');
    }
  }

  return {
    configured: issues.length === 0,
    issues,
    keyKind,
    urlHost,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().configured;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    const url = normalizeSupabaseUrl(trimEnv(rawUrl));
    const key = trimEnv(rawKey);
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export const SUPABASE_SETUP_HINT =
  'Copy .env.example to .env, set VITE_SUPABASE_URL (https://xxxx.supabase.co, no trailing slash) and VITE_SUPABASE_ANON_KEY (legacy anon eyJ… or publishable sb_publishable_… from Project Settings → API), run supabase/migrations/001_initial.sql, then restart the dev server.';

/** User-facing message for network / fetch failures (no secrets). */
export function formatSupabaseFetchError(
  message: string,
  status?: SupabaseConfigStatus,
): string {
  const host = status?.urlHost ?? 'your Supabase project';
  const keyHint =
    status?.keyKind === 'publishable'
      ? 'You are using a publishable key (sb_publishable_…); that is supported. If login still fails, try the legacy anon key (eyJ…) from the same API page.'
      : status?.keyKind === 'legacy-jwt'
        ? 'You are using a legacy anon key (eyJ…). If you recently rotated keys, copy the current anon or publishable key from Project Settings → API.'
        : 'In .env use VITE_SUPABASE_ANON_KEY = legacy anon (eyJ…) or publishable (sb_publishable_…), not the service role / secret key.';

  return [
    `Cannot reach Supabase (${message}).`,
    `Check ${host} in the dashboard: project not paused, URL exactly https://<ref>.supabase.co, and the correct public key in .env.`,
    keyHint,
    'Restart `npm run dev` after changing .env. For production, add your app URL under Authentication → URL configuration.',
  ].join(' ');
}

/** True when PostgREST reports a missing column (e.g. Patreon migration not applied). */
export function isSupabaseColumnMissingError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist/i.test(error.message ?? '');
}

export function formatSupabaseAuthError(
  error: { message?: string } | null | undefined,
  status: SupabaseConfigStatus = getSupabaseConfigStatus(),
): string {
  const message = error?.message?.trim() || 'Authentication failed.';
  if (/failed to fetch|networkerror|load failed|network request failed|err_connection/i.test(message)) {
    return formatSupabaseFetchError(message, status);
  }
  if (/invalid api key|apikey|jwt|unauthorized/i.test(message)) {
    return `${message} — Check VITE_SUPABASE_ANON_KEY in .env (anon eyJ… or publishable sb_publishable_… from Project Settings → API), then restart the dev server.`;
  }
  if (/email not confirmed/i.test(message)) {
    return 'Your account is not active yet. Try signing in again in a moment. If this keeps happening, ask an admin to deploy the confirm-local-signup edge function, or turn off “Confirm email” under Authentication → Providers → Email in the Supabase dashboard.';
  }
  return message;
}

/** Generic message for failed username/password login (avoids user enumeration). */
export const INVALID_LOGIN_CREDENTIALS_MESSAGE =
  'Invalid username or password.';

export function isInvalidLoginCredentialsError(
  error: { message?: string } | null | undefined,
): boolean {
  const message = error?.message?.trim() ?? '';
  return /invalid login credentials|invalid email or password/i.test(message);
}
