import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { BackgroundGifOverlay } from './components/BackgroundGifOverlay';
import { SoapBubbleField } from './components/SoapBubbleField';
import { AppStoreProvider } from './hooks/useAppStore';
import { AudioPlayerProvider } from './contexts/AudioPlayerProvider';
import { VideoPlaybackProvider } from './contexts/VideoPlaybackContext';
import { VideoPlayerProvider } from './contexts/VideoPlayerProvider';
import { Admin } from './pages/Admin';
import { CategoryDetail } from './pages/CategoryDetail';
import { TaskFocusPage } from './pages/TaskFocusPage';
import { Dashboard } from './pages/Dashboard';
import { Videos } from './pages/Videos';
import { VideoCategoryDetail } from './pages/VideoCategoryDetail';
import { Login } from './pages/Login';
import { Punishments } from './pages/Punishments';
import { Rewards } from './pages/Rewards';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Today } from './pages/Today';
import { MiniGames } from './pages/MiniGames';
import { FlashWordGamePage } from './pages/FlashWordGamePage';
import { InteractiveVideos } from './pages/InteractiveVideos';
import { InteractiveVideoPlay } from './pages/InteractiveVideoPlay';

function AppChrome() {
  return (
    <VideoPlaybackProvider>
      <VideoPlayerProvider>
        <BackgroundGifOverlay />
        <SoapBubbleField />
        <Outlet />
      </VideoPlayerProvider>
    </VideoPlaybackProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <AppChrome />,
    children: [
      { path: '/login', element: <Login /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <Layout />,
            children: [
              { index: true, element: <Dashboard /> },
              { path: 'today', element: <Today /> },
              { path: 'category/:categoryId', element: <CategoryDetail /> },
              {
                path: 'category/:categoryId/task/:taskId',
                element: <TaskFocusPage />,
              },
              { path: 'videos', element: <Videos /> },
              { path: 'videos/interactive', element: <InteractiveVideos /> },
              {
                path: 'videos/interactive/:videoId',
                element: <InteractiveVideoPlay />,
              },
              {
                path: 'videos/category/:categoryId',
                element: <VideoCategoryDetail />,
              },
              {
                path: 'library',
                element: <Navigate to="/videos" replace />,
              },
              { path: 'rewards', element: <Rewards /> },
              { path: 'punishments', element: <Punishments /> },
              { path: 'profile', element: <Profile /> },
              { path: 'mini-games', element: <MiniGames /> },
              { path: 'mini-games/:gameId', element: <FlashWordGamePage /> },
              { path: 'settings', element: <Settings /> },
            ],
          },
          {
            element: <AdminRoute />,
            children: [{ path: 'admin', element: <Admin /> }],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return (
    <AppStoreProvider>
      <AudioPlayerProvider>
        <RouterProvider router={router} />
      </AudioPlayerProvider>
    </AppStoreProvider>
  );
}
