import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore, SUPABASE_SETUP_HINT } from '../hooks/useAppStore';
import { isSupabaseConfigured } from '../lib/supabase';

export function Login() {
  const { session, authReady, login, supabaseConfigured } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (authReady && session) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.ok) {
      navigate(from, { replace: true });
    } else {
      setError(result.error);
    }
  };

  const showSetupBanner = !isSupabaseConfigured() || !supabaseConfigured;

  return (
    <div className="login-page">
      <div className="login-card card">
        <h1 className="app-title">Dickalicious Plaything</h1>
        <p className="app-tagline">Sign in to continue</p>

        {showSetupBanner && (
          <div className="setup-banner" role="status">
            <p className="setup-banner__title">Supabase setup required</p>
            <p className="muted setup-banner__text">{SUPABASE_SETUP_HINT}</p>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={!supabaseConfigured}
            />
          </label>
          <p className="muted login-hint">
            Legacy username accounts: use <code>username@local.app</code> as the
            email.
          </p>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              disabled={!supabaseConfigured}
            />
          </label>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={submitting || !supabaseConfigured}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="muted login-hint">
          First admin: create a user in Supabase Dashboard → Authentication, then
          set <code>role</code> to <code>admin</code> in the{' '}
          <code>profiles</code> table (or use user metadata on sign-up).
        </p>
      </div>
    </div>
  );
}
