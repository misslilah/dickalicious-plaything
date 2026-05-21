import { Navigate } from 'react-router-dom';

/** Today is merged into the home dashboard. */
export function Today() {
  return <Navigate to="/" replace />;
}
