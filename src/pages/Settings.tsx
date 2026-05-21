import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';

export function Settings() {
  const {
    state,
    session,
    updateSettings,
    resetAll,
    logout,
    changePassword,
    lastSaveError,
    clearSaveError,
  } = useAppStore();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    const result = await changePassword(newPassword);
    if (result.ok) {
      setPasswordMessage('Password updated.');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPasswordError(result.error);
    }
  };

  const handleReset = async () => {
    setResetMessage('');
    setResetError('');
    if (
      !window.confirm(
        'Reset your progress, daily plans, and punishments? Shared catalog data is not affected.',
      )
    ) {
      return;
    }
    const result = await resetAll();
    if (result.ok) {
      setResetMessage('Your progress has been reset.');
    } else {
      setResetError(result.error);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h2>Settings</h2>
        {session && (
          <p className="muted">
            Signed in as <strong>{session.username}</strong> ({session.role})
          </p>
        )}
      </header>

      {lastSaveError && (
        <p className="login-error" role="alert">
          {lastSaveError}{' '}
          <button type="button" className="btn btn--ghost btn--small" onClick={clearSaveError}>
            Dismiss
          </button>
        </p>
      )}

      {session?.role === 'admin' && (
        <section className="card">
          <h3 className="section-title">Admin</h3>
          <Link to="/admin" className="btn btn--primary btn--block">
            Open admin panel
          </Link>
        </section>
      )}

      <section className="card">
        <h3 className="section-title">Daily rules</h3>
        <label className="field">
          <span>Daily quota (%)</span>
          <input
            type="number"
            min={50}
            max={100}
            value={state.settings.dailyQuotaPercent}
            onChange={(e) =>
              updateSettings({ dailyQuotaPercent: Number(e.target.value) })
            }
          />
        </label>
        <label className="field">
          <span>Reset hour (0–23)</span>
          <input
            type="number"
            min={0}
            max={23}
            value={state.settings.resetHour}
            onChange={(e) => updateSettings({ resetHour: Number(e.target.value) })}
          />
        </label>
        <p className="muted">
          The day starts after this hour. The plan regenerates automatically.
          Settings sync to the server for your account.
        </p>
      </section>

      <section className="card">
        <h3 className="section-title">Change password</h3>
        <form onSubmit={handlePasswordChange}>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {passwordError && (
            <p className="login-error" role="alert">
              {passwordError}
            </p>
          )}
          {passwordMessage && <p className="notice">{passwordMessage}</p>}
          <button type="submit" className="btn btn--primary btn--block">
            Update password
          </button>
        </form>
      </section>

      <section className="card">
        <button type="button" className="btn btn--ghost btn--block" onClick={() => void logout()}>
          Sign out
        </button>
        <button type="button" className="btn btn--danger" onClick={() => void handleReset()}>
          Reset my progress
        </button>
        {resetError && (
          <p className="login-error" role="alert">
            {resetError}
          </p>
        )}
        {resetMessage && <p className="notice">{resetMessage}</p>}
        <p className="muted">
          Resets XP, streak, daily plans, and punishments for your account only.
          Categories, tasks, and videos managed by admins are unchanged.
        </p>
      </section>
    </div>
  );
}
