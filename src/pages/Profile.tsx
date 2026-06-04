import { FormEvent, useEffect, useState } from 'react';
import { BadgeGrid } from '../components/BadgeGrid';
import { useAppStore } from '../hooks/useAppStore';
import { getUserStage, getStageLabel, formatLevelDisplay } from '../lib/levels';
import { updateProfileUsername } from '../lib/profileDb';
import { tierLabel } from '../lib/tiers';

export function Profile() {
  const { state, session, refreshProfile } = useAppStore();
  const { progress, unlockedBadgeIds } = state;

  const [username, setUsername] = useState(session?.username ?? '');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  const stage = getUserStage(progress.currentLevel);

  const patreonTierLabel =
    session?.patreonStatus === 'active' && session.patreonTier
      ? tierLabel(session.patreonTier)
      : 'None';

  useEffect(() => {
    setUsername(session?.username ?? '');
  }, [session?.username]);

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
        <BadgeGrid
          badges={state.badges}
          unlockedBadgeIds={unlockedBadgeIds}
          tasks={state.tasks}
          categories={state.categories}
        />
      </section>
    </div>
  );
}
