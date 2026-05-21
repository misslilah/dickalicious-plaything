import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';

export function ProtectedRoute() {
  const { session, authReady, dataLoading, dataError } = useAppStore();
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
        <p className="login-error" role="alert">
          {dataError}
        </p>
        <p className="muted">Check Supabase configuration and try signing in again.</p>
      </div>
    );
  }

  return <Outlet />;
}
