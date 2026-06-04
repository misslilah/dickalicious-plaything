import type {
  PatreonMemberTier,
  PatreonStatus,
  Session as AppSession,
  UserRole,
} from '../types';
import {
  formatSupabaseAuthError,
  getSupabase,
  isSupabaseColumnMissingError,
  isSupabaseConfigured,
} from './supabase';

export interface AuthSession {
  userId: string;
  email: string;
  username: string;
  role: UserRole;
  patreonTier: PatreonMemberTier | null;
  patreonStatus: PatreonStatus;
  patreonUserId: string | null;
}

const PROFILE_SELECT_WITH_PATREON =
  'username, role, patreon_tier, patreon_status, patreon_user_id';
const PROFILE_SELECT_BASE = 'username, role';

const LOCAL_APP_DOMAIN = '@local.app';

type ProfileRow = {
  username?: string | null;
  role?: string | null;
  patreon_tier?: PatreonMemberTier | null;
  patreon_status?: PatreonStatus | null;
  patreon_user_id?: string | null;
};

/** Map username to internal email for legacy-style usernames. */
export function usernameToEmail(username: string): string {
  const trimmed = username.trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  return `${trimmed}${LOCAL_APP_DOMAIN}`;
}

export function isLocalAppEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith(LOCAL_APP_DOMAIN) && e.length > LOCAL_APP_DOMAIN.length;
}

function isEmailNotConfirmedError(message: string): boolean {
  return /email not confirmed/i.test(message);
}

/** Auto-confirm synthetic @local.app accounts (requires confirm-local-signup edge function). */
async function confirmLocalAppSignup(
  email: string,
  userId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured.' };
  }

  const { data, error } = await supabase.functions.invoke('confirm-local-signup', {
    body: { email, ...(userId ? { userId } : {}) },
  });

  if (error) {
    return {
      ok: false,
      error:
        'Could not activate your username account. Deploy the confirm-local-signup edge function to your Supabase project, or disable “Confirm email” under Authentication → Providers → Email.',
    };
  }

  const payload = data as { ok?: boolean; error?: string } | null;
  if (payload?.error === 'not_configured') {
    return {
      ok: false,
      error:
        'Account activation is not configured on the server. Deploy confirm-local-signup or disable email confirmation in Supabase.',
    };
  }
  if (payload?.ok !== true && payload?.error) {
    return { ok: false, error: 'Could not activate your account. Try again shortly.' };
  }

  return { ok: true };
}

function profileRowToSession(
  userId: string,
  email: string,
  row: ProfileRow,
): AuthSession {
  return {
    userId,
    email,
    username: row.username?.trim() || 'User',
    role: (row.role as UserRole) ?? 'user',
    patreonTier: row.patreon_tier ?? null,
    patreonStatus: row.patreon_status ?? 'none',
    patreonUserId: row.patreon_user_id ?? null,
  };
}

async function fetchProfileRow(
  userId: string,
): Promise<{ ok: true; row: ProfileRow } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const full = await supabase
    .from('profiles')
    .select(PROFILE_SELECT_WITH_PATREON)
    .eq('id', userId)
    .maybeSingle();

  if (!full.error && full.data) {
    return { ok: true, row: full.data as ProfileRow };
  }

  if (full.error && isSupabaseColumnMissingError(full.error)) {
    const base = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_BASE)
      .eq('id', userId)
      .maybeSingle();
    if (base.error) return { ok: false, error: base.error.message };
    if (!base.data) return { ok: false, error: 'Profile not found.' };
    return { ok: true, row: base.data as ProfileRow };
  }

  if (full.error) return { ok: false, error: full.error.message };
  return { ok: false, error: 'Profile not found.' };
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return null;

    const profile = await fetchProfileRow(user.id);
    if (!profile.ok) return null;

    return profileRowToSession(user.id, user.email ?? '', profile.row);
  } catch {
    return null;
  }
}

export function sessionToApp(session: AuthSession): AppSession {
  return {
    userId: session.userId,
    username: session.username,
    role: session.role,
    patreonTier: session.patreonTier,
    patreonStatus: session.patreonStatus,
    patreonUserId: session.patreonUserId,
  };
}

export async function login(
  emailOrUsername: string,
  password: string,
): Promise<{ ok: true; session: AuthSession } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase is not configured. See setup instructions on the login page.' };
  }

  const supabase = getSupabase()!;
  const email = emailOrUsername.includes('@')
    ? emailOrUsername.trim().toLowerCase()
    : usernameToEmail(emailOrUsername);

  const attemptSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  };

  try {
    let signInError = await attemptSignIn();
    if (
      signInError &&
      isEmailNotConfirmedError(signInError.message) &&
      isLocalAppEmail(email)
    ) {
      const confirmed = await confirmLocalAppSignup(email);
      if (confirmed.ok) {
        signInError = await attemptSignIn();
      }
    }
    if (signInError) {
      return { ok: false, error: formatSupabaseAuthError(signInError) };
    }
  } catch (err) {
    return {
      ok: false,
      error: formatSupabaseAuthError(
        err instanceof Error ? err : { message: String(err) },
      ),
    };
  }

  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, error: 'Signed in but profile not found. Ask an admin to check your account.' };
  }
  return { ok: true, session };
}

export async function logout(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) await supabase.auth.signOut();
}

export async function changePassword(
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters.' };
  }
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signUp(
  username: string,
  password: string,
): Promise<
  { ok: true; session: AuthSession } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Supabase is not configured. See setup instructions on the login page.',
    };
  }

  const trimmedUsername = username.trim();
  if (!trimmedUsername) return { ok: false, error: 'Username is required.' };
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }

  const email = usernameToEmail(trimmedUsername);
  const supabase = getSupabase()!;

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: trimmedUsername },
      },
    });
    if (error) {
      return { ok: false, error: formatSupabaseAuthError(error) };
    }

    if (data.session?.user) {
      const session = await getCurrentSession();
      if (session) return { ok: true, session };
    }

    if (isLocalAppEmail(email)) {
      const confirmed = await confirmLocalAppSignup(email, data.user?.id);
      if (!confirmed.ok) return { ok: false, error: confirmed.error };
    }

    return login(trimmedUsername, password);
  } catch (err) {
    return {
      ok: false,
      error: formatSupabaseAuthError(
        err instanceof Error ? err : { message: String(err) },
      ),
    };
  }
}

/** Admin-only helper: creates a regular user account (never admin). */
export async function createUser(
  username: string,
  password: string,
  role: UserRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (role === 'admin') {
    return {
      ok: false,
      error:
        'Admin accounts cannot be created here. Set role to admin in Supabase Dashboard → profiles.',
    };
  }

  const trimmed = username.trim();
  if (!trimmed) return { ok: false, error: 'Username is required.' };
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const email = usernameToEmail(trimmed);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: trimmed },
    },
  });

  if (error) {
    return {
      ok: false,
      error:
        formatSupabaseAuthError(error) +
        ' (If sign-ups are disabled, create the user in the Supabase Dashboard → Authentication.)',
    };
  }

  if (!data.session && isLocalAppEmail(email)) {
    const confirmed = await confirmLocalAppSignup(email, data.user?.id);
    if (!confirmed.ok) return { ok: false, error: confirmed.error };
  }

  return { ok: true };
}

export function onAuthStateChange(
  callback: (session: AuthSession | null) => void,
): (() => void) | undefined {
  const supabase = getSupabase();
  if (!supabase) return undefined;

  const { data } = supabase.auth.onAuthStateChange((_event, authSession) => {
    if (!authSession?.user) {
      callback(null);
      return;
    }
    void getCurrentSession()
      .then(callback)
      .catch(() => callback(null));
  });

  return () => data.subscription.unsubscribe();
}
