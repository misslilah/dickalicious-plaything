import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { getUserStage, getStageLabel, formatLevelDisplay } from '../lib/levels';
import {
  fetchOnlineProfiles,
  updateProfileUsername,
  type OnlineProfileRow,
} from '../lib/profileDb';
import { getSupabase } from '../lib/supabase';
import { tierLabel } from '../lib/tiers';

export function Profile() {
  const { state, session, refreshProfile } = useAppStore();
  const { progress, unlockedRewardIds } = state;

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState(session?.username ?? '');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState<OnlineProfileRow[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [onlineError, setOnlineError] = useState('');

  const stage = getUserStage(progress.currentLevel);
  const badges = state.rewards.filter((r) => r.autoTrigger);

  const patreonTierLabel =
    session?.patreonStatus === 'active' && session.patreonTier
      ? tierLabel(session.patreonTier)
      : 'None';

  const loadOnline = useCallback(async () => {
    setOnlineLoading(true);
    setOnlineError('');
    const result = await fetchOnlineProfiles();
    setOnlineLoading(false);
    if (!result.ok) {
      setOnlineError(result.error);
      return;
    }
    setOnlineUsers(result.profiles);
  }, []);

  useEffect(() => {
    setUsername(session?.username ?? '');
  }, [session?.username]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '');
    });
  }, [session?.userId]);

  useEffect(() => {
    void loadOnline();
    const id = window.setInterval(() => void loadOnline(), 30_000);
    return () => window.clearInterval(id);
  }, [loadOnline]);

  const handleUsernameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.userId) return;
    setUsernameMessage('');
    setUsernameError('');
    setUsernameSaving(true);
    const result = await updateProfileUsername(session.userId, username);
    setUsernameSaving(false);
    if (!result.ok) {
      setUsernameError(result.error);
      return;
    }
    setUsername(result.username);
    setUsernameMessage('Username updated.');
    await refreshProfile();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h2>Profile</h2>
        <p className="muted">Your account, progress, and badges</p>
      </header>

      <section className="card">
        <h3 className="section-title">Account</h3>
        <dl className="profile-stats">
          <div className="profile-stats__row">
            <dt>Username</dt>
            <dd>{session?.username ?? '—'}</dd>
          </div>
          <div className="profile-stats__row">
            <dt>Email</dt>
            <dd>{email || '—'}</dd>
          </div>
          <div className="profile-stats__row">
            <dt>Role</dt>
            <dd>{session?.role ?? '—'}</dd>
          </div>
          <div className="profile-stats__row">
            <dt>Patreon tier</dt>
            <dd>{patreonTierLabel}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h3 className="section-title">Progress</h3>
        <dl className="profile-stats">
          <div className="profile-stats__row">
            <dt>Level</dt>
            <dd>
              {formatLevelDisplay(progress.currentLevel)} ({progress.currentLevel})
            </dd>
          </div>
          <div className="profile-stats__row">
            <dt>Stage</dt>
            <dd>{getStageLabel(stage)}</dd>
          </div>
          <div className="profile-stats__row">
            <dt>Total XP</dt>
            <dd>{progress.totalXp}</dd>
          </div>
          <div className="profile-stats__row">
            <dt>Malus</dt>
            <dd>{progress.malusPoints}</dd>
          </div>
          <div className="profile-stats__row">
            <dt>Points</dt>
            <dd>{progress.points}</dd>
          </div>
          <div className="profile-stats__row">
            <dt>Streak</dt>
            <dd>{progress.streak} days</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h3 className="section-title">Edit username</h3>
        <form onSubmit={(e) => void handleUsernameSubmit(e)}>
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          {usernameError && (
            <p className="login-error" role="alert">
              {usernameError}
            </p>
          )}
          {usernameMessage && <p className="notice">{usernameMessage}</p>}
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={usernameSaving}
          >
            {usernameSaving ? 'Saving…' : 'Save username'}
          </button>
        </form>
      </section>

      <section className="card">
        <h3 className="section-title">Badges</h3>
        {badges.length === 0 ? (
          <p className="muted">No badges in the catalog yet.</p>
        ) : (
          <ul className="badge-list profile-badge-grid">
            {badges.map((reward) => {
              const earned = unlockedRewardIds.includes(reward.id);
              return (
                <li
                  key={reward.id}
                  className={`reward-item${earned ? ' reward-item--earned' : ''}`}
                >
                  <span className="reward-icon">{earned ? '🏅' : '🔒'}</span>
                  <div>
                    <strong>{reward.title}</strong>
                    <p className="muted">{reward.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">Online now</h3>
        <p className="muted">Players active in the last 2 minutes.</p>
        {onlineLoading && <p className="muted">Loading…</p>}
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
                <span>{user.username}</span>
                {user.id === session?.userId && (
                  <span className="tag tag--ok">You</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
