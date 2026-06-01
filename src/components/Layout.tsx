import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AudioPlayerBar } from './AudioPlayerBar';
import { AudioPlaylistPreviewModal } from './AudioPlaylistPreviewModal';
import { useAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useAppStore } from '../hooks/useAppStore';

const baseNavItems = [
  { to: '/videos', label: 'Videos', icon: '🎬' },
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/rewards', label: 'Rewards', icon: '🏆' },
  { to: '/punishments', label: 'Punishments', icon: '⚡' },
  { to: '/profile', label: 'Profile', icon: '👤' },
  { to: '/mini-games', label: 'Games', icon: '🎮' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const adminNavItem = { to: '/admin', label: 'Admin', icon: '🛠️' };

export function Layout() {
  const { session } = useAppStore();
  const { currentTrack } = useAudioPlayer();
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith('/admin');
  const navItems =
    session?.role === 'admin'
      ? [...baseNavItems, adminNavItem]
      : baseNavItems;
  const playerActive = currentTrack != null;

  return (
    <div
      className={
        isAdminRoute
          ? 'app-shell app-shell--admin-full'
          : `app-shell${playerActive ? ' app-shell--audio-playing' : ''}`
      }
    >
      <header className="app-header">
        <h1 className="app-title">Dickalicious Plaything</h1>
        <p className="app-tagline">
          {session
            ? `Welcome, ${session.username}`
            : 'Discipline & progress'}
        </p>
      </header>
      <main className="app-main">
        <div className="app-content">
          <Outlet />
        </div>
      </main>
      <AudioPlayerBar />
      <AudioPlaylistPreviewModal />
      <nav className="bottom-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `nav-link${isActive ? ' nav-link--active' : ''}`
            }
          >
            <span className="nav-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
