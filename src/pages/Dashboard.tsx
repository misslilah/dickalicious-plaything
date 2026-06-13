import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminBroadcastComposeModal } from '../components/AdminBroadcastComposeModal';
import { AdminLockCardComposeModal } from '../components/AdminLockCardComposeModal';
import { CategoryCard } from '../components/CategoryCard';
import { DailyTasksSection } from '../components/DailyTasksSection';
import { XpBar } from '../components/XpBar';
import { useAppStore } from '../hooks/useAppStore';
import { useSendAdminBroadcast } from '../hooks/useAdminBroadcast';
import { useAdminLockCards } from '../hooks/useLockCard';
import { useOnlinePresence } from '../hooks/useOnlinePresence';
import {
  canJoinCategory,
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
  getCategoryCompletionStats,
  getCategoryGroup,
  getCategoryUnlockBlockReason,
  getPreviousTierGroup,
  getTierGroupStats,
  getTierUnlockProgressLabel,
  isCategoryFullyComplete,
  isCategoryUnlocked,
  isTierGroupUnlocked,
  MAX_ACTIVE_CATEGORY_JOINS,
  TIER_UNLOCK_PERCENT,
} from '../lib/categoryProgression';
import { formatLevelDisplay } from '../lib/levels';
import { clearLockCard, createLockCard } from '../lib/lockCardDb';
import { getTodayPlan, homePlanCompletionStats } from '../lib/gameLogic';

type ComposeTarget =
  | { kind: 'all' }
  | { kind: 'user'; userId: string; username: string };

type LockTarget = { userId: string; username: string };

export function Dashboard() {
  const { state, session, joinCategory, isEffectiveAdmin } = useAppStore();
  const isAdmin = isEffectiveAdmin;
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
  const [lockTarget, setLockTarget] = useState<LockTarget | null>(null);
  const [manualLockUserId, setManualLockUserId] = useState('');
  const [clearingLockId, setClearingLockId] = useState<string | null>(null);
  const {
    lockCards: activeLockCards,
    loading: lockCardsLoading,
    error: lockCardsError,
    refresh: refreshLockCards,
  } = useAdminLockCards(isAdmin);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState('');
  const { progress } = state;
  const plan = getTodayPlan(state);
  const stats = homePlanCompletionStats(state, plan, session?.userId ?? null);
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

  const usernameForUserId = useCallback(
    (userId: string) =>
      onlineUsers.find((user) => user.id === userId)?.username ??
      `${userId.slice(0, 8)}…`,
    [onlineUsers],
  );

  const handleCreateLockCard = useCallback(
    async (phrase: string, requiredCount: number, targetUserId: string) => {
      if (!session?.userId) {
        return { ok: false, error: 'Not signed in.' };
      }
      const result = await createLockCard({
        userId: targetUserId,
        phrase,
        requiredCount,
        createdBy: session.userId,
      });
      if (result.ok) {
        void refreshLockCards();
      }
      return result.ok
        ? { ok: true }
        : { ok: false, error: result.error };
    },
    [session?.userId, refreshLockCards],
  );

  const handleClearLockCard = async (lockId: string) => {
    setClearingLockId(lockId);
    const result = await clearLockCard(lockId);
    setClearingLockId(null);
    if (result.ok) {
      void refreshLockCards();
    }
  };

  const openManualLock = () => {
    const userId = manualLockUserId.trim();
    if (!userId) return;
    setLockTarget({ userId, username: userId.slice(0, 8) + '…' });
  };

  return (
    <div className="page page--home">
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
          {isAdmin && (
            <div className="online-panel__lock-by-id">
              <label className="online-panel__lock-by-id-label" htmlFor="lock-user-id">
                Lock by user ID
              </label>
              <div className="form-inline">
                <input
                  id="lock-user-id"
                  type="text"
                  value={manualLockUserId}
                  onChange={(e) => setManualLockUserId(e.target.value)}
                  placeholder="User UUID…"
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={openManualLock}
                  disabled={!manualLockUserId.trim()}
                >
                  Lock card
                </button>
              </div>
            </div>
          )}
          {isAdmin && (
            <div className="online-panel__active-locks">
              <h3 className="online-panel__active-locks-title">Active lock cards</h3>
              {lockCardsLoading && <p className="muted">Loading lock cards…</p>}
              {lockCardsError && (
                <p className="login-error" role="alert">
                  {lockCardsError}
                </p>
              )}
              {!lockCardsLoading && !lockCardsError && activeLockCards.length === 0 && (
                <p className="muted">No active lock cards.</p>
              )}
              {!lockCardsLoading && activeLockCards.length > 0 && (
                <ul className="active-lock-cards-list">
                  {activeLockCards.map((lock) => (
                    <li key={lock.id} className="active-lock-cards-list__item">
                      <div className="active-lock-cards-list__meta">
                        <strong>{usernameForUserId(lock.userId)}</strong>
                        <span className="muted">
                          {lock.completedCount}/{lock.requiredCount} · &ldquo;
                          {lock.phrase.length > 32
                            ? `${lock.phrase.slice(0, 32)}…`
                            : lock.phrase}
                          &rdquo;
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => void handleClearLockCard(lock.id)}
                        disabled={clearingLockId === lock.id}
                      >
                        {clearingLockId === lock.id ? 'Clearing…' : 'Clear'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
                    <>
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
                      <button
                        type="button"
                        className="btn btn--ghost btn--small online-users-list__lock"
                        onClick={() =>
                          setLockTarget({
                            userId: user.id,
                            username: user.username,
                          })
                        }
                      >
                        Lock card
                      </button>
                    </>
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

      <AdminLockCardComposeModal
        open={lockTarget !== null}
        targetLabel={lockTarget?.username ?? ''}
        targetUserId={lockTarget?.userId ?? ''}
        onClose={() => setLockTarget(null)}
        onCreate={handleCreateLockCard}
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
                  Complete at least {TIER_UNLOCK_PERCENT}% of{' '}
                  {CATEGORY_GROUP_LABELS[prevGroup]} categories to unlock this tier.
                  {' '}
                  {getTierUnlockProgressLabel(state, group)}
                </p>
              )}
              {!tierLocked && group !== 'all' && group !== 'beginner' && prevGroup && (
                <p className="muted category-tier__hint">
                  {getTierUnlockProgressLabel(state, group) ??
                    `${getTierGroupStats(state, prevGroup).percent}% of ${CATEGORY_GROUP_LABELS[prevGroup]} categories completed.`}
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
                  const isCompleted = isCategoryFullyComplete(state, cat.id);

                  return (
                    <CategoryCard
                      key={cat.id}
                      category={cat}
                      taskCount={taskCountByCategory(cat.id)}
                      completionPercent={completion.percent}
                      completedCount={completion.completed}
                      isMember={isMember}
                      isCompleted={isCompleted}
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
