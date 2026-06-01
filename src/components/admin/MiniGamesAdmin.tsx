import { useState } from 'react';
import { FlashWordGameAdmin } from './FlashWordGameAdmin';

const MINI_GAMES_TABS = [
  { id: 'flash-cards' as const, label: 'Flash Cards' },
] as const;

type MiniGamesTabId = (typeof MINI_GAMES_TABS)[number]['id'];

export function MiniGamesAdmin() {
  const [tab, setTab] = useState<MiniGamesTabId>('flash-cards');

  return (
    <div className="admin-minigames">
      <div className="admin-minigames-tabs" role="tablist" aria-label="Mini games admin">
        {MINI_GAMES_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={
              tab === id
                ? 'admin-minigames-tab admin-minigames-tab--active'
                : 'admin-minigames-tab'
            }
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'flash-cards' && <FlashWordGameAdmin />}
    </div>
  );
}
