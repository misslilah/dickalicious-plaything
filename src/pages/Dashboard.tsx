import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminBroadcastComposeModal } from '../components/AdminBroadcastComposeModal';
import { AdminLockCardComposeModal } from '../components/AdminLockCardComposeModal';
import { DailyTasksSection } from '../components/DailyTasksSection';
import { HomeHubMenu } from '../components/HomeHubMenu';
import { UserAvatar } from '../components/UserAvatar';
import { XpBar } from '../components/XpBar';
import { useAppStore } from '../hooks/useAppStore';
import { useSendAdminBroadcast } from '../hooks/useAdminBroadcast';
import { useAdminLockCards } from '../hooks/useLockCard';
import { useOnlinePresence } from '../hooks/useOnlinePresence';
import { MAX_ACTIVE_CATEGORY_JOINS } from '../lib/categoryProgression';
import { formatLevelDisplay } from '../lib/levels';
import { clearLockCard, createLockCard } from '../lib/lockCardDb';
import { getTodayPlan, homePlanCompletionStats } from '../lib/gameLogic';

type ComposeTarget =
  | { kind: 'all' }
  | { kind: 'user'; userId: string; username: string };

type LockTarget = { userId: string; username: string };

export function Dashboard() {
  const { state, session, isEffectiveAdmin } = useAppStore();
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
  const { progress } = state;
  const plan = getTodayPlan(state);
  const stats = homePlanCompletionStats(state, plan, session?.userId ?? null);
  const malus = state.progress.malusPoints;
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
        <div className="home-hero__top">
          {session ? (
            <Link
              to="/profile"
              className="home-hero__avatar"
              aria-label="Your profile"
            >
              <UserAvatar
                url={session.avatarUrl}
                name={session.username}
                frameId={session.avatarFrameId}
                size="md"
              />
            </Link>
          ) : null}
          <div data-tutorial="home-xp">
            <p className="home-hero__kicker">Train. Obey. Level up.</p>
            <XpBar
              totalXp={progress.totalXp}
              currentLevel={progress.currentLevel}
              levelName={formatLevelDisplay(progress.currentLevel)}
            />
          </div>
        </div>
        <div className="home-stats__row">
          <span className="home-stats__chip home-stats__chip--streak">
            🔥 {progress.streak}d streak
          </span>
          <span className="home-stats__chip home-stats__chip--points">
            ⭐ {progress.points} pts
          </span>
          {plan && stats.total > 0 && (
            <span className="home-stats__chip home-stats__chip--today">
              ✓ {stats.completed}/{stats.total} today
            </span>
          )}
          <span className="home-stats__chip home-stats__chip--joined">
            📂 {state.joinedCategoryIds.length}/{MAX_ACTIVE_CATEGORY_JOINS} joined
          </span>
        </div>
      </section>

      <HomeHubMenu />

      {malus > 0 && (
        <section className="card card--warn">
          <p>
            You have <strong>{malus}</strong> active malus point{malus === 1 ? '' : 's'}.
            Tasks are blocked until you clear your malus.{' '}
            <Link to="/university/punishments">Complete a punishment</Link> to reduce your balance.
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
    </div>
  );
}
