import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';

const baseNavItems = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/videos', label: 'Videos', icon: '🎬' },
  { to: '/rewards', label: 'Rewards', icon: '🏆' },
  { to: '/punishments', label: 'Punishments', icon: '⚡' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const adminNavItem = { to: '/admin', label: 'Admin', icon: '🛠️' };

export function Layout() {
  const { session } = useAppStore();
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith('/admin');
  const navItems =
    session?.role === 'admin'
      ? [...baseNavItems, adminNavItem]
      : baseNavItems;

  return (
    <div
      className={
        isAdminRoute ? 'app-shell app-shell--admin-full' : 'app-shell'
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
        <Outlet />
      </main>
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
