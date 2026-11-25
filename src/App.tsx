import { lazy, Suspense, type ComponentType } from 'react';
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
import { AppStoreProvider, useAppStore } from './hooks/useAppStore';
import { areBubblesEnabled } from './lib/appSettings';
import { AudioPlayerProvider } from './contexts/AudioPlayerProvider';
import { VideoPlaybackProvider } from './contexts/VideoPlaybackContext';
import { VideoPlayerProvider } from './contexts/VideoPlayerProvider';
import { VideoPlaylistPlaybackProvider } from './contexts/VideoPlaylistPlaybackContext';
import { XpToastProvider } from './contexts/XpToastContext';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { AgeGate } from './components/AgeGate';

function RouteFallback() {
  return (
    <div className="page">
      <p className="muted">Loading…</p>
    </div>
  );
}

function lazyPage(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
) {
  const Page = lazy(async () => {
    const module = await loader();
    const component = module[exportName];
    if (typeof component !== 'function') {
      throw new Error(`Missing page export: ${exportName}`);
    }
    return { default: component as ComponentType };
  });

  return function LazyPage() {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Page />
      </Suspense>
    );
  };
}

const Admin = lazyPage(() => import('./pages/Admin'), 'Admin');
const CategoryDetail = lazyPage(() => import('./pages/CategoryDetail'), 'CategoryDetail');
const TaskFocusPage = lazyPage(() => import('./pages/TaskFocusPage'), 'TaskFocusPage');
const Videos = lazyPage(() => import('./pages/Videos'), 'Videos');
const Training = lazyPage(() => import('./pages/Training'), 'Training');
const VideoCategoryDetail = lazyPage(
  () => import('./pages/VideoCategoryDetail'),
  'VideoCategoryDetail',
);
const Punishments = lazyPage(() => import('./pages/Punishments'), 'Punishments');
const UniversityLayout = lazyPage(() => import('./pages/University'), 'UniversityLayout');
const UniversityClasses = lazyPage(() => import('./pages/University'), 'UniversityClasses');
const UniversityClassDetail = lazyPage(
  () => import('./pages/UniversityClassDetail'),
  'UniversityClassDetail',
);
const UniversityThemeDetail = lazyPage(
  () => import('./pages/UniversityThemeDetail'),
  'UniversityThemeDetail',
);
const Shop = lazyPage(() => import('./pages/Shop'), 'Shop');
const Profile = lazyPage(() => import('./pages/Profile'), 'Profile');
const Settings = lazyPage(() => import('./pages/Settings'), 'Settings');
const Today = lazyPage(() => import('./pages/Today'), 'Today');
const MiniGames = lazyPage(() => import('./pages/MiniGames'), 'MiniGames');
const Community = lazyPage(() => import('./pages/Community'), 'Community');
const FlashWordGamePage = lazyPage(
  () => import('./pages/FlashWordGamePage'),
  'FlashWordGamePage',
);
const InteractiveVideos = lazyPage(
  () => import('./pages/InteractiveVideos'),
  'InteractiveVideos',
);
const InteractiveVideoPlay = lazyPage(
  () => import('./pages/InteractiveVideoPlay'),
  'InteractiveVideoPlay',
);
const VideoPlaylistPlay = lazyPage(
  () => import('./pages/VideoPlaylistPlay'),
  'VideoPlaylistPlay',
);
function AppChrome() {
  const { state } = useAppStore();
  const showBubbles = areBubblesEnabled(state.settings);

  return (
    <VideoPlaybackProvider>
      <XpToastProvider>
        <VideoPlaylistPlaybackProvider>
          <VideoPlayerProvider>
            <BackgroundGifOverlay />
            {showBubbles && <SoapBubbleField />}
            <Outlet />
          </VideoPlayerProvider>
        </VideoPlaylistPlaybackProvider>
      </XpToastProvider>
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
          { path: 'character', element: <Navigate to="/" replace /> },
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
              { path: 'training', element: <Training /> },
              { path: 'videos/playlist/:playlistId', element: <VideoPlaylistPlay /> },
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
              { path: 'community', element: <Community /> },
              { path: 'shop', element: <Shop /> },
              { path: 'rewards', element: <Navigate to="/shop" replace /> },
              {
                path: 'university',
                element: <UniversityLayout />,
                children: [
                  { index: true, element: <UniversityClasses /> },
                  { path: 'class/:classId', element: <UniversityClassDetail /> },
                  { path: 'theme/:familyId', element: <UniversityThemeDetail /> },
                  { path: 'punishments', element: <Punishments /> },
                ],
              },
              { path: 'punishments', element: <Navigate to="/university/punishments" replace /> },
              { path: 'profile', element: <Profile /> },
              { path: 'profile/:userId', element: <Profile /> },
              { path: 'u/:username', element: <Profile /> },
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
    <AgeGate>
      <AppStoreProvider>
        <AudioPlayerProvider>
          <RouterProvider router={router} />
        </AudioPlayerProvider>
      </AppStoreProvider>
    </AgeGate>
  );
}
