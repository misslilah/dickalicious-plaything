import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore, SUPABASE_SETUP_HINT } from '../hooks/useAppStore';
import {
  getSupabaseConfigStatus,
  isSupabaseConfigured,
} from '../lib/supabase';
import { PrivacyNotice } from '../components/PrivacyNotice';

type AuthMode = 'signin' | 'signup';

export function Login() {
  const { session, authReady, login, signUp, supabaseConfigured } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? '/';

  const [mode, setMode] = useState<AuthMode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!authReady) {
    return (
      <div className="auth-loading">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to={from} replace />;
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    const result = await login(username, password);
    setSubmitting(false);
    if (result.ok) {
      navigate(from, { replace: true });
    } else {
      setError(result.error);
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    const result = await signUp(username, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(from, { replace: true });
  };

  const configStatus = getSupabaseConfigStatus();
  const showSetupBanner =
    !isSupabaseConfigured() || !supabaseConfigured || configStatus.issues.length > 0;

  return (
    <div className="login-page">
      <div className="login-card card">
        <h1 className="app-title">Dickalicious Plaything</h1>
        <p className="app-tagline">
          {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
        </p>

        <div className="login-mode-toggle btn-row" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={
              mode === 'signin'
                ? 'btn btn--primary btn--small'
                : 'btn btn--ghost btn--small'
            }
            onClick={() => {
              setMode('signin');
              setError('');
              setNotice('');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={
              mode === 'signup'
                ? 'btn btn--primary btn--small'
                : 'btn btn--ghost btn--small'
            }
            onClick={() => {
              setMode('signup');
              setError('');
              setNotice('');
            }}
          >
            Sign up
          </button>
        </div>

        {showSetupBanner && (
          <div className="setup-banner" role="status">
            <p className="setup-banner__title">Supabase setup required</p>
            {configStatus.issues.length > 0 ? (
              <ul className="muted setup-banner__text setup-banner__list">
                {configStatus.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p className="muted setup-banner__text">{SUPABASE_SETUP_HINT}</p>
            )}
          </div>
        )}

        {mode === 'signin' ? (
          <form className="login-form" onSubmit={(e) => void handleSignIn(e)}>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your username"
                required
                disabled={!supabaseConfigured}
              />
            </label>
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
            {notice && <p className="notice">{notice}</p>}

            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={submitting || !supabaseConfigured}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="login-form" onSubmit={(e) => void handleSignUp(e)}>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                required
                disabled={!supabaseConfigured}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required
                disabled={!supabaseConfigured}
              />
            </label>

            {error && <p className="login-error" role="alert">{error}</p>}
            {notice && <p className="notice">{notice}</p>}

            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={submitting || !supabaseConfigured}
            >
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}

        <PrivacyNotice variant="login" />
      </div>
    </div>
  );
}
