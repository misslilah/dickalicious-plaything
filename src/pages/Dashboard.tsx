import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminBroadcastComposeModal } from '../components/AdminBroadcastComposeModal';
import { CategoryCard } from '../components/CategoryCard';
import { DailyTasksSection } from '../components/DailyTasksSection';
import { XpBar } from '../components/XpBar';
import { useAppStore } from '../hooks/useAppStore';
import { useSendAdminBroadcast } from '../hooks/useAdminBroadcast';
import { useOnlinePresence } from '../hooks/useOnlinePresence';
import { formatLevelDisplay } from '../lib/levels';
import { completionStats, getTodayPlan } from '../lib/gameLogic';

type ComposeTarget =
  | { kind: 'all' }
  | { kind: 'user'; userId: string; username: string };

export function Dashboard() {
  const { state, session } = useAppStore();
  const isAdmin = session?.role === 'admin';
  const sendAdminBroadcast = useSendAdminBroadcast(session?.userId);
  const {
    onlineUsers,
    loading: onlineLoading,
    error: onlineError,
  } = useOnlinePresence(session?.userId, session?.username);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [composeTarget, setComposeTarget] = useState<ComposeTarget | null>(null);
  const { progress } = state;
  const plan = getTodayPlan(state);
  const stats = completionStats(plan);
  const malus = state.progress.malusPoints;

  const taskCountByCategory = (categoryId: string) =>
    state.tasks.filter(
      (t) => (t.taskScope ?? 'category') === 'category' && t.categoryId === categoryId,
    ).length;

  return (
    <div className="page">
      <section className="home-stats card card--hero">
        <XpBar
          totalXp={progress.totalXp}
          currentLevel={progress.currentLevel}
          levelName={formatLevelDisplay(progress.currentLevel)}
        />
        <div className="home-stats__row">
          <span className="home-stats__chip">
            🔥 {progress.streak}d streak
          </span>
          <span className="home-stats__chip">
            ⭐ {progress.points} pts
          </span>
          {plan && stats.total > 0 && (
            <span className="home-stats__chip">
              ✓ {stats.completed}/{stats.total} today
            </span>
          )}
        </div>
      </section>

      {malus > 0 && (
        <section className="card card--warn">
          <p>
            {malus} malus point{malus === 1 ? '' : 's'}.{' '}
            <Link to="/punishments">Clear malus with a punishment</Link>
          </p>
        </section>
      )}

      <section
        className={`card online-section${onlineOpen ? ' online-section--expanded' : ''}`}
      >
        <button
          type="button"
          className="online-section__toggle"
          aria-expanded={onlineOpen}
          aria-controls="online-users-panel"
          onClick={() => setOnlineOpen((open) => !open)}
        >
          <h2 className="section-title">👥 Online users</h2>
          <span className="online-section__meta">
            {!onlineLoading && !onlineError && (
              <span className="online-section__count">
                {onlineUsers.length === 0
                  ? 'None'
                  : `${onlineUsers.length} online`}
              </span>
            )}
            <span className="online-section__chevron" aria-hidden>
              ▾
            </span>
          </span>
        </button>
        <div id="online-users-panel" className="online-panel">
          <p className="muted online-panel__hint">
            Live — updates instantly when players join or leave.
          </p>
          {isAdmin && !onlineLoading && !onlineError && onlineUsers.length > 0 && (
            <div className="online-panel__admin-actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setComposeTarget({ kind: 'all' })}
              >
                Message everyone online
              </button>
            </div>
          )}
          {onlineLoading && <p className="muted">Connecting…</p>}
          {onlineError && (
            <p className="login-error" role="alert">
              {onlineError}
            </p>
          )}
          {!onlineLoading && !onlineError && onlineUsers.length === 0 && (
            <p className="muted">No one else online right now.</p>
          )}
          {!onlineLoading && onlineUsers.length > 0 && (
            <ul className="online-users-list">
              {onlineUsers.map((user) => (
                <li key={user.id} className="online-users-list__item">
                  <span className="online-users-list__dot" aria-hidden />
                  <span className="online-users-list__name">{user.username}</span>
                  {user.id === session?.userId && (
                    <span className="tag tag--ok">You</span>
                  )}
                  {isAdmin && user.id !== session?.userId && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small online-users-list__message"
                      onClick={() =>
                        setComposeTarget({
                          kind: 'user',
                          userId: user.id,
                          username: user.username,
                        })
                      }
                    >
                      Message
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <AdminBroadcastComposeModal
        open={composeTarget !== null}
        targetLabel={
          composeTarget?.kind === 'user'
            ? composeTarget.username
            : 'Everyone online'
        }
        targetUserId={
          composeTarget?.kind === 'user' ? composeTarget.userId : null
        }
        onClose={() => setComposeTarget(null)}
        onSend={sendAdminBroadcast}
      />

      <DailyTasksSection />

      <section>
        <h2 className="section-title">Categories</h2>
        {state.categories.length === 0 ? (
          <section className="card">
            <p className="muted">
              No categories yet. An admin can create categories from the admin panel.
            </p>
          </section>
        ) : (
          <div className="category-grid">
            {state.categories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                taskCount={taskCountByCategory(cat.id)}
                isMember={state.joinedCategoryIds.includes(cat.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
