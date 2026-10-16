import { CommunityChatPanel } from '../components/CommunityChatPanel';

export function Community() {
  return (
    <div className="page community-page">
      <header className="community-page__header">
        <p className="community-page__kicker">Lounge</p>
        <h2 className="community-page__title">Community</h2>
        <p className="muted community-page__tagline">
          Announcements, rooms, and private messages — all in one place.
        </p>
      </header>
      <div className="community-page__stage">
        <CommunityChatPanel variant="page" />
      </div>
    </div>
  );
}
