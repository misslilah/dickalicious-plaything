import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AdminMessageListener } from './AdminMessageListener';
import { LockCardOverlay } from './LockCardOverlay';
import { AudioPlaylistBubble } from './AudioPlaylistBubble';
import { CommunityChatBubble } from './CommunityChatBubble';
import { PatreonBubble } from './PatreonBubble';
import { ThroneBubble } from './ThroneBubble';
import { useAppStore } from '../hooks/useAppStore';

export function ProtectedRoute() {
  const { session, authReady, dataLoading, dataError, refresh, logout } =
    useAppStore();
  const location = useLocation();

  if (!authReady || (session && dataLoading)) {
    return (
      <div className="auth-loading">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (dataError) {
    return (
      <div className="auth-loading">
        <div className="login-card card">
          <h1 className="app-title">Could not load your data</h1>
          <p className="login-error" role="alert">
            {dataError}
          </p>
          <p className="muted">
            Check Supabase configuration, run pending SQL migrations (including{' '}
            <code>003_patreon_tiers_fix.sql</code>), then try again.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void refresh()}
            >
              Retry
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
          <p className="muted login-hint">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminMessageListener />
      <LockCardOverlay />
      <AudioPlaylistBubble />
      <CommunityChatBubble />
      <ThroneBubble />
      <PatreonBubble />
      <Outlet />
    </>
  );
}
