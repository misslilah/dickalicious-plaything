import { Link } from 'react-router-dom';

const HUB_ITEMS = [
  {
    to: '/videos',
    label: 'Videos',
    hint: 'Catalog, playlists, interactive',
    icon: '🎬',
    tutorial: 'home-hub-videos',
    color: '#e879f9',
  },
  {
    to: '/shop',
    label: 'Shop',
    hint: 'Spend points on extras',
    icon: '🛍️',
    tutorial: 'home-hub-shop',
    color: '#f5c84c',
  },
  {
    to: '/university',
    label: 'University',
    hint: 'Themes, tasks, punishments',
    icon: '🎓',
    tutorial: 'home-hub-university',
    color: '#c084fc',
  },
  {
    to: '/mini-games',
    label: 'Games',
    hint: 'Mini-games when you want a round',
    icon: '🎮',
    tutorial: 'home-hub-games',
    color: '#ff4fbf',
  },
] as const;

export function HomeHubMenu() {
  return (
    <section className="home-hub" aria-label="Explore" data-tutorial="home-hub">
      <div className="home-hub__head">
        <h2 className="section-title">Explore</h2>
        <p className="muted">Jump into the campus.</p>
      </div>
      <nav className="home-hub__grid" aria-label="Main sections">
        {HUB_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="home-hub__tile"
            data-tutorial={item.tutorial}
            style={{ ['--hub-color' as string]: item.color }}
          >
            <span className="home-hub__icon" aria-hidden>
              {item.icon}
            </span>
            <span className="home-hub__copy">
              <span className="home-hub__label">{item.label}</span>
              <span className="home-hub__hint">{item.hint}</span>
            </span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
