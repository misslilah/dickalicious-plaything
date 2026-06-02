import { usePersistedSearchParam } from '../../hooks/usePersistedSearchParam';
import { ADMIN_MINIGAMES_TABS } from '../../lib/adminNavPersistence';
import { FlashWordGameAdmin } from './FlashWordGameAdmin';
import { FollowInstinctGameAdmin } from './FollowInstinctGameAdmin';

const MINI_GAMES_TABS = [
  { id: 'flash-cards' as const, label: 'Flash Cards' },
  { id: 'follow-instinct' as const, label: 'Follow your instinct' },
] as const;

type MiniGamesTabId = (typeof MINI_GAMES_TABS)[number]['id'];

export function MiniGamesAdmin() {
  const [tab, setTab] = usePersistedSearchParam(
    'minigamesTab',
    ADMIN_MINIGAMES_TABS,
    'flash-cards',
  );

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
      {tab === 'follow-instinct' && <FollowInstinctGameAdmin />}
    </div>
  );
}
