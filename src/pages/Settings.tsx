import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../hooks/useAppStore';
import {
  connectPatreonAccount,
  isPatreonOAuthConfigured,
  patreonOAuthStatusMessageFromProbe,
  probePatreonOAuthStart,
} from '../lib/patreon';
import { areBubblesEnabled } from '../lib/appSettings';
import { tierLabel } from '../lib/tiers';

export function Settings() {
  const {
    session,
    state,
    updateSettings,
    resetAll,
    logout,
    changePassword,
    lastSaveError,
    clearSaveError,
    refreshPatreonProfile,
    adminUserPreview,
    setAdminUserPreview,
  } = useAppStore();
  const bubblesEnabled = areBubblesEnabled(state.settings);
  const [searchParams, setSearchParams] = useSearchParams();
  const [patreonNotice, setPatreonNotice] = useState('');
  const [patreonConnectError, setPatreonConnectError] = useState('');
  const [patreonConnecting, setPatreonConnecting] = useState(false);
  const [patreonDeployWarning, setPatreonDeployWarning] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    const patreon = searchParams.get('patreon');
    if (!patreon) return;
    const detail = searchParams.get('detail');
    const isAdmin = session?.role === 'admin';

    if (patreon === 'connected') {
      setPatreonNotice('Patreon account linked successfully.');
      void refreshPatreonProfile();
    } else if (patreon === 'no_tier') {
      const detailMessages: Record<string, string> = {
        no_memberships:
          'Patreon linked, but no membership was returned. Ensure you are an active patron of this creator.',
        not_active_patron:
          'Patreon linked, but your patron status is not active. Check your pledge on Patreon.',
        no_entitled_tiers:
          'Patreon linked, but no entitled tier was found on your membership.',
        tier_id_mismatch:
          'Patreon linked, but your tier ID does not match server configuration (PATREON_TIER_REWARD_IDS).',
        campaign_mismatch:
          'Patreon linked, but your membership is for a different campaign. Check PATREON_CREATOR_CAMPAIGN_ID.',
        campaign_include_missing:
          'Patreon linked, but campaign data was missing from the API response (redeploy callback).',
      };
      const isCampaignMismatchDetail =
        detail?.startsWith('campaign_mismatch_expected_') ||
        detail?.startsWith('campaign_mismatch_f');
      const detailKey = isCampaignMismatchDetail ? 'campaign_mismatch' : (detail ?? '');
      const base =
        detailMessages[detailKey] ??
        'Patreon account linked, but no matching tier was found. If you are an active patron, ask an admin to check Edge Function logs.';
      let campaignMismatchAdminHint = '';
      if (isAdmin && detail) {
        const expectedGot = detail.match(/^campaign_mismatch_expected_([^_]+)_got_(.+)$/);
        if (expectedGot) {
          campaignMismatchAdminHint = ` Expected ${expectedGot[1]}, got ${expectedGot[2].replace(/_/g, ', ')}.`;
        } else {
          const legacy = detail.match(/^campaign_mismatch_f([^_]+)_m(.+)$/);
          if (legacy) {
            campaignMismatchAdminHint = ` Expected ${legacy[1]}, got ${legacy[2]}.`;
          }
        }
      }
      setPatreonNotice(
        isAdmin && detail
          ? `${base}${campaignMismatchAdminHint} (detail: ${detail})`
          : base,
      );
      void refreshPatreonProfile();
    } else if (patreon === 'not_configured') {
      setPatreonNotice('Patreon OAuth is not configured on the server yet.');
    } else if (patreon === 'profile_update_error') {
      setPatreonNotice(
        isAdmin
          ? 'Patreon authorized, but saving your profile failed. Check Edge Function logs and profiles RLS.'
          : 'Patreon authorized, but we could not save your membership. Try again or ask an admin.',
      );
    } else if (
      patreon === 'error' ||
      patreon === 'token_error' ||
      patreon === 'identity_error'
    ) {
      const detailHint =
        isAdmin && detail ? ` (${detail})` : '';
      setPatreonNotice(`Could not connect Patreon. Try again or ask an admin.${detailHint}`);
    }
    searchParams.delete('patreon');
    searchParams.delete('detail');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, refreshPatreonProfile, session?.role]);

  const patreonOAuthAvailable = isPatreonOAuthConfigured();

  useEffect(() => {
    if (!patreonOAuthAvailable) return;
    let cancelled = false;
    void probePatreonOAuthStart().then((probe) => {
      if (cancelled) return;
      const msg = patreonOAuthStatusMessageFromProbe(
        probe,
        session?.role === 'admin',
      );
      setPatreonDeployWarning(msg ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [patreonOAuthAvailable, session?.role]);

  const handleConnectPatreon = async () => {
    if (!session?.userId) return;
    setPatreonConnectError('');
    setPatreonConnecting(true);
    const result = await connectPatreonAccount(session.userId, '/settings', {
      isAdmin: session.role === 'admin',
    });
    setPatreonConnecting(false);
    if (!result.ok) {
      console.error('[connectPatreon]', result.message);
      setPatreonConnectError(result.message);
    }
  };

  const patreonTierLabel =
    session?.patreonStatus === 'active' && session.patreonTier
      ? tierLabel(session.patreonTier)
      : 'None (public videos only)';

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
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={adminUserPreview}
              onChange={(e) => setAdminUserPreview(e.target.checked)}
            />
            <span>
              <strong>View as user</strong>
              <br />
              <span className="muted">
                Preview the app as a new member. You can join categories, start
                and complete tasks, and try the full flow — nothing is saved.
                Your real progress comes back when you turn this off.
              </span>
            </span>
          </label>
          {!adminUserPreview && (
            <Link to="/admin" className="btn btn--primary btn--block">
              Open admin panel
            </Link>
          )}
        </section>
      )}

      <section className="card">
        <h3 className="section-title">Appearance</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={bubblesEnabled}
            onChange={(e) => updateSettings({ bubblesEnabled: e.target.checked })}
          />
          <span>
            <strong>Soap bubbles</strong>
            <br />
            <span className="muted">Show floating bubbles you can pop on screen</span>
          </span>
        </label>
      </section>

      <section className="card">
        <h3 className="section-title">Patreon membership</h3>
        <p className="muted">
          Video access is based on your Patreon tier: Sweetie, Princess, or Slut
          (higher tiers include lower tiers).
        </p>
        <p>
          Current tier:{' '}
          <span className="tier-badge tier-badge--active">{patreonTierLabel}</span>
        </p>
        {session?.patreonUserId && (
          <p className="muted">Patreon linked (ID: {session.patreonUserId})</p>
        )}
        {patreonNotice && <p className="notice">{patreonNotice}</p>}
        {patreonDeployWarning && (
          <p className="login-error" role="alert">
            {patreonDeployWarning}
          </p>
        )}
        {patreonConnectError && (
          <p className="login-error" role="alert">
            {patreonConnectError}
          </p>
        )}
        {patreonOAuthAvailable ? (
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={patreonConnecting}
            onClick={() => void handleConnectPatreon()}
          >
            {patreonConnecting ? 'Checking Patreon…' : 'Connect Patreon'}
          </button>
        ) : (
          <p className="muted">
            Patreon OAuth requires <code>VITE_SUPABASE_URL</code> in <code>.env</code>.
            Deploy Edge Functions on Supabase before connecting (see README). An admin
            can set your tier manually until then.
          </p>
        )}
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
