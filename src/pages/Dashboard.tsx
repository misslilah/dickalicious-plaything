import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminBroadcastComposeModal } from '../components/AdminBroadcastComposeModal';
import { CategoryCard } from '../components/CategoryCard';
import { DailyTasksSection } from '../components/DailyTasksSection';
import { XpBar } from '../components/XpBar';
import { useAppStore } from '../hooks/useAppStore';
import { useSendAdminBroadcast } from '../hooks/useAdminBroadcast';
import { useOnlinePresence } from '../hooks/useOnlinePresence';
import {
  canJoinCategory,
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
  getCategoryCompletionStats,
  getCategoryGroup,
  getCategoryUnlockBlockReason,
  getPreviousTierGroup,
  isCategoryUnlocked,
  isTierGroupUnlocked,
  MAX_ACTIVE_CATEGORY_JOINS,
} from '../lib/categoryProgression';
import { formatLevelDisplay } from '../lib/levels';
import { completionStats, getTodayPlan } from '../lib/gameLogic';

type ComposeTarget =
  | { kind: 'all' }
  | { kind: 'user'; userId: string; username: string };

export function Dashboard() {
  const { state, session, joinCategory } = useAppStore();
  const isAdmin = session?.role === 'admin';
  const sendAdminBroadcast = useSendAdminBroadcast(
    session?.userId,
    session?.username,
  );
  const {
    onlineUsers,
    loading: onlineLoading,
    error: onlineError,
  } = useOnlinePresence(session?.userId, session?.username);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [composeTarget, setComposeTarget] = useState<ComposeTarget | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState('');
  const { progress } = state;
  const plan = getTodayPlan(state);
  const stats = completionStats(plan);
  const malus = state.progress.malusPoints;

  const taskCountByCategory = (categoryId: string) =>
    state.tasks.filter(
      (t) => (t.taskScope ?? 'category') === 'category' && t.categoryId === categoryId,
    ).length;

  const handleJoin = async (categoryId: string) => {
    setJoinError('');
    setJoiningId(categoryId);
    const result = await joinCategory(categoryId);
    setJoiningId(null);
    if (!result.ok) setJoinError(result.error);
  };

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
          <span className="home-stats__chip">
            📂 {state.joinedCategoryIds.length}/{MAX_ACTIVE_CATEGORY_JOINS} joined
          </span>
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

      {joinError && (
        <p className="login-error" role="alert">
          {joinError}
        </p>
      )}

      {state.categories.length === 0 ? (
        <section className="card">
          <h2 className="section-title">Categories</h2>
          <p className="muted">
            No categories yet. An admin can create categories from the admin panel.
          </p>
        </section>
      ) : (
        CATEGORY_GROUP_ORDER.map((group) => {
          const cats = state.categories.filter(
            (cat) => getCategoryGroup(cat) === group,
          );
          if (cats.length === 0) return null;

          const tierLocked =
            group !== 'all' && !isTierGroupUnlocked(state, group);
          const prevGroup = getPreviousTierGroup(group);

          return (
            <section
              key={group}
              className={
                tierLocked
                  ? 'card category-tier category-tier--locked'
                  : 'card category-tier'
              }
            >
              <h2 className="section-title">{CATEGORY_GROUP_LABELS[group]}</h2>
              {tierLocked && prevGroup && (
                <p className="muted category-tier__hint">
                  Complete any {CATEGORY_GROUP_LABELS[prevGroup]} category to
                  unlock this tier.
                </p>
              )}
              <div className="category-grid">
                {cats.map((cat) => {
                  const isMember = state.joinedCategoryIds.includes(cat.id);
                  const unlocked = isCategoryUnlocked(state, cat);
                  const lockReason = getCategoryUnlockBlockReason(state, cat);
                  const completion = getCategoryCompletionStats(state, cat.id);
                  const joinGate = canJoinCategory(
                    state,
                    cat,
                    state.progress.currentLevel,
                  );

                  return (
                    <CategoryCard
                      key={cat.id}
                      category={cat}
                      taskCount={taskCountByCategory(cat.id)}
                      completionPercent={completion.percent}
                      completedCount={completion.completed}
                      isMember={isMember}
                      isUnlocked={unlocked}
                      lockReason={lockReason}
                      canJoin={joinGate.ok}
                      joinDisabledReason={joinGate.ok ? null : joinGate.reason}
                      onJoin={
                        isAdmin ? undefined : () => void handleJoin(cat.id)
                      }
                      joining={joiningId === cat.id}
                    />
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
