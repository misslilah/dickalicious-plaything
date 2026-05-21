import type {
  PatreonMemberTier,
  PatreonStatus,
  Session as AppSession,
  UserRole,
} from '../types';
import {
  formatSupabaseAuthError,
  getSupabase,
  getSupabaseConfigStatus,
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

/** Map username to internal email for legacy-style usernames. */
export function usernameToEmail(username: string): string {
  const trimmed = username.trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  return `${trimmed}@local.app`;
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('username, role, patreon_tier, patreon_status, patreon_user_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) return null;

  return {
    userId: user.id,
    email: user.email ?? '',
    username: profile.username,
    role: profile.role as UserRole,
    patreonTier: (profile.patreon_tier as PatreonMemberTier | null) ?? null,
    patreonStatus: (profile.patreon_status as PatreonStatus) ?? 'none',
    patreonUserId: (profile.patreon_user_id as string | null) ?? null,
  };
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

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { ok: false, error: formatSupabaseAuthError(error) };
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

export async function createUser(
  username: string,
  password: string,
  role: UserRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = username.trim();
  if (!trimmed) return { ok: false, error: 'Username is required.' };
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const email = usernameToEmail(trimmed);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: trimmed, role },
    },
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message +
        ' (If sign-ups are disabled, create the user in the Supabase Dashboard → Authentication.)',
    };
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
    void getCurrentSession().then(callback);
  });

  return () => data.subscription.unsubscribe();
}
