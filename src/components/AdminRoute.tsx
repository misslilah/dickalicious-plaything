import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';

export function AdminRoute() {
  const { session, authReady } = useAppStore();

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

  if (session.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
