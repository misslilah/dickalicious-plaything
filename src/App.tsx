import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppStoreProvider } from './hooks/useAppStore';
import { Admin } from './pages/Admin';
import { CategoryDetail } from './pages/CategoryDetail';
import { Dashboard } from './pages/Dashboard';
import { Videos } from './pages/Videos';
import { VideoCategoryDetail } from './pages/VideoCategoryDetail';
import { Login } from './pages/Login';
import { Punishments } from './pages/Punishments';
import { Rewards } from './pages/Rewards';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Today } from './pages/Today';

export default function App() {
  return (
    <AppStoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="today" element={<Today />} />
              <Route path="category/:categoryId" element={<CategoryDetail />} />
              <Route path="videos" element={<Videos />} />
              <Route
                path="videos/category/:categoryId"
                element={<VideoCategoryDetail />}
              />
              <Route path="library" element={<Navigate to="/videos" replace />} />
              <Route path="rewards" element={<Rewards />} />
              <Route path="punishments" element={<Punishments />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route element={<AdminRoute />}>
              <Route path="admin" element={<Admin />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppStoreProvider>
  );
}
