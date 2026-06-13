import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';

export function AdminRoute() {
  const { session, authReady, isEffectiveAdmin } = useAppStore();

  if (!authReady) {
    return (
      <div className="auth-loading">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!isEffectiveAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
