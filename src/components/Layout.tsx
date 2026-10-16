import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AudioPlayerBar } from './AudioPlayerBar';
import { AudioPlaylistPreviewModal } from './AudioPlaylistPreviewModal';
import { ThroneGiftToast } from './ThroneGiftToast';
import { UserAvatar } from './UserAvatar';
import { useAudioPlayer } from '../contexts/AudioPlayerProvider';
import { useAppStore } from '../hooks/useAppStore';
import { USER_PREVIEW_SANDBOX_BANNER } from '../lib/adminUserMode';
import { SITE_TUTORIAL_NAV_TARGETS } from '../lib/siteTutorial';
import { useThroneGiftRealtime } from '../hooks/useThroneGiftRealtime';

const baseNavItems = [
  { to: '/videos', label: 'Videos', icon: '🎬' },
  { to: '/training', label: 'Training', icon: '📚' },
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/shop', label: 'Shop', icon: '🛍️' },
  { to: '/university', label: 'University', icon: '🎓' },
  { to: '/profile', label: 'Profile', icon: '👤' },
  { to: '/mini-games', label: 'Games', icon: '🎮' },
  { to: '/community', label: 'Community', icon: '💬' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const adminNavItem = { to: '/admin', label: 'Admin', icon: '🛠️' };

export function Layout() {
  const { session, isEffectiveAdmin, adminUserPreview } = useAppStore();
  const { toast, dismissToast } = useThroneGiftRealtime(session?.userId);
  const { currentTrack } = useAudioPlayer();
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith('/admin');
  const isCommunityRoute = pathname === '/community';
  const navItems =
    isEffectiveAdmin
      ? [...baseNavItems, adminNavItem]
      : baseNavItems;
  const audioBarActive = currentTrack != null;
  const shellMediaClass = audioBarActive ? 'app-shell--audio-playing' : '';

  return (
    <div
      className={
        isAdminRoute
          ? 'app-shell app-shell--admin-full'
          : `app-shell${shellMediaClass ? ` ${shellMediaClass}` : ''}`
      }
    >
      <header className="app-header">
        <div className="app-header__copy">
          <h1 className="app-title">Dickalicious Plaything</h1>
          <p className="app-tagline">
            {session
              ? `Welcome, ${session.username}`
              : 'Obey · Train · Glow'}
          </p>
        </div>
        {session && !isAdminRoute ? (
          <Link
            to="/profile"
            className="app-header__avatar"
            aria-label="Your profile"
          >
            <UserAvatar
              url={session.avatarUrl}
              name={session.username}
              frameId={session.avatarFrameId}
              size="sm"
            />
          </Link>
        ) : null}
      </header>
      <main className={`app-main${isCommunityRoute ? ' app-main--community' : ''}`}>
        <div className={`app-content${isCommunityRoute ? ' app-content--community' : ''}`}>
          {adminUserPreview && (
            <p className="notice user-preview-banner" role="status">
              {USER_PREVIEW_SANDBOX_BANNER}{' '}
              <Link to="/settings">turn off in Settings</Link>
            </p>
          )}
          <Outlet />
        </div>
      </main>
      <AudioPlayerBar />
      <AudioPlaylistPreviewModal />
      <ThroneGiftToast toast={toast} userId={session?.userId} onDismiss={dismissToast} />
      <nav className="bottom-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            data-tutorial={SITE_TUTORIAL_NAV_TARGETS[item.to]}
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
