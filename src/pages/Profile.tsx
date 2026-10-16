import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BadgeGrid } from '../components/BadgeGrid';
import { CharacterSprite } from '../components/CharacterSprite';
import { useAppStore } from '../hooks/useAppStore';
import {
  appearanceFromSession,
  characterSizeSummary,
  isCharacterComplete,
  readLocalPreviewCharacter,
} from '../lib/characterSprite';
import {
  DEMO_PUBLIC_PROFILE_NOTICE,
  getDemoPublicProfile,
  isDemoPublicProfileLookup,
} from '../lib/demoPublicProfile';
import { getUserStage, getStageLabel, formatLevelDisplay } from '../lib/levels';
import { getProfileBanner } from '../lib/profileBanners';
import {
  BIO_MAX_LENGTH,
  fetchPublicProfile,
  updateProfileBio,
  updateProfileUsername,
  uploadProfileAvatar,
  type PublicProfile,
} from '../lib/profileDb';
import { requestOpenUserDm } from '../lib/userDirectMessages';
import { tierLabel } from '../lib/tiers';
import type { CharacterAppearance } from '../types';

function appearanceFromPublic(profile: PublicProfile): CharacterAppearance | null {
  if (!profile.characterGender) return null;
  return {
    gender: profile.characterGender,
    breastSize: profile.characterBreastSize,
    penisSize: profile.characterPenisSize,
    equipped: profile.characterEquipped,
  };
}

function wantsOwnPublicPreview(searchParams: URLSearchParams): boolean {
  const preview = searchParams.get('preview');
  const view = searchParams.get('view');
  return preview === '1' || preview === 'true' || view === 'public';
}

function ownPublicPreviewPath(
  session: { userId: string; username: string } | null | undefined,
): string {
  const username = session?.username?.trim();
  if (username) return `/u/${encodeURIComponent(username)}?preview=1`;
  if (session?.userId) return `/profile/${session.userId}?view=public`;
  return '/profile?preview=1';
}

function ProfileAvatar({
  url,
  name,
  editable,
  uploading,
  onPick,
}: {
  url: string | null;
  name: string;
  editable: boolean;
  uploading: boolean;
  onPick?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = (name.trim()[0] || '?').toUpperCase();

  const inner = url ? (
    <img src={url} alt="" className="profile-avatar__img" />
  ) : (
    <span className="profile-avatar__fallback" aria-hidden>
      {initial}
    </span>
  );

  if (!editable || !onPick) {
    return (
      <div className="profile-avatar" aria-hidden={!url}>
        {inner}
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        className="profile-avatar profile-avatar--edit"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Change profile picture"
      >
        {inner}
        <span className="profile-avatar__camera" aria-hidden>
          {uploading ? '…' : '📷'}
        </span>
      </button>
    </>
  );
}

export function Profile() {
  const { userId: routeUserId, username: routeUsername } = useParams();
  const [searchParams] = useSearchParams();
  const { state, session, effectiveSession, refreshProfile, adminUserPreview } =
    useAppStore();
  const { progress, unlockedBadgeIds } = state;
  const navigate = useNavigate();

  const lookup = routeUserId || routeUsername || null;
  const isDemoPublic = isDemoPublicProfileLookup(lookup);
  const isOwnRoute =
    !isDemoPublic &&
    (!lookup ||
      lookup === session?.userId ||
      lookup.toLowerCase() === (session?.username ?? '').toLowerCase());
  const publicPreview =
    wantsOwnPublicPreview(searchParams) && isOwnRoute && Boolean(session);

  const demoBadgeIds = useMemo(
    () =>
      state.badges
        .filter((badge) => !badge.isSecret)
        .slice(0, 4)
        .map((badge) => badge.id),
    [state.badges],
  );

  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [publicError, setPublicError] = useState('');
  const [publicLoading, setPublicLoading] = useState(!isOwnRoute);

  const [username, setUsername] = useState(session?.username ?? '');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  const [bio, setBio] = useState(session?.bio ?? '');
  const [bioMessage, setBioMessage] = useState('');
  const [bioError, setBioError] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  useEffect(() => {
    if (isDemoPublic) {
      setPublicProfile(getDemoPublicProfile(demoBadgeIds));
      setPublicError('');
      setPublicLoading(false);
      return;
    }

    if (isOwnRoute) {
      setPublicProfile(null);
      setPublicError('');
      setPublicLoading(false);
      return;
    }

    let cancelled = false;
    setPublicLoading(true);
    setPublicError('');
    void fetchPublicProfile(lookup!).then((result) => {
      if (cancelled) return;
      setPublicLoading(false);
      if (!result.ok) {
        setPublicError(result.error);
        setPublicProfile(null);
        return;
      }
      if (result.profile.id === session?.userId) {
        setPublicProfile(null);
        return;
      }
      setPublicProfile(result.profile);
    });

    return () => {
      cancelled = true;
    };
  }, [demoBadgeIds, isDemoPublic, isOwnRoute, lookup, session?.userId]);

  useEffect(() => {
    setUsername(session?.username ?? '');
    setBio(session?.bio ?? '');
  }, [session?.username, session?.bio]);

  const isOwner =
    isOwnRoute || (!publicLoading && !publicError && publicProfile == null);
  const showOwnerUi = isOwner && !publicPreview;
  const savedAppearance = appearanceFromSession(session);
  const ownAppearance = adminUserPreview
    ? readLocalPreviewCharacter()
    : savedAppearance;
  const publicAppearance = publicProfile
    ? appearanceFromPublic(publicProfile)
    : null;
  const appearance = isOwner
    ? publicPreview
      ? savedAppearance
      : ownAppearance
    : publicAppearance;
  const hasCharacter = isCharacterComplete(appearance);

  const displayName = isOwner
    ? session?.username ?? 'You'
    : publicProfile?.username ?? 'Member';
  const displayBio = isOwner ? session?.bio ?? '' : publicProfile?.bio ?? '';
  const displayAvatar = isOwner
    ? session?.avatarUrl ?? null
    : publicProfile?.avatarUrl ?? null;
  const banner = getProfileBanner(
    isOwner ? session?.bannerId : publicProfile?.bannerId,
  );
  const shownBadgeIds = isOwner
    ? unlockedBadgeIds
    : publicProfile?.badgeIds ?? [];
  const levelValue = isOwner
    ? progress.currentLevel
    : publicProfile?.currentLevel;
  const xpValue = isOwner ? progress.totalXp : publicProfile?.totalXp;
  const streakValue = isOwner ? progress.streak : publicProfile?.streak;

  const stage = getUserStage(progress.currentLevel);
  const patreonTierLabel =
    effectiveSession?.patreonStatus === 'active' && effectiveSession.patreonTier
      ? tierLabel(effectiveSession.patreonTier)
      : 'None';

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

  const handleBioSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.userId) return;
    setBioMessage('');
    setBioError('');
    setBioSaving(true);
    const result = await updateProfileBio(session.userId, bio);
    setBioSaving(false);
    if (!result.ok) {
      setBioError(result.error);
      return;
    }
    setBio(result.bio);
    setBioMessage('Description saved.');
    await refreshProfile();
  };

  const handleAvatarPick = async (file: File) => {
    if (!session?.userId) return;
    setAvatarError('');
    setAvatarUploading(true);
    const result = await uploadProfileAvatar(session.userId, file);
    setAvatarUploading(false);
    if (!result.ok) {
      setAvatarError(result.error);
      return;
    }
    await refreshProfile();
  };

  if (!isOwner && publicLoading) {
    return (
      <div className="page page--profile">
        <p className="muted">Loading profile…</p>
      </div>
    );
  }

  if (!isOwner && publicError) {
    return (
      <div className="page page--profile">
        <header className="page-header">
          <h2>Profile</h2>
        </header>
        <section className="card">
          <p className="login-error" role="alert">
            {publicError}
          </p>
          <Link to="/profile" className="btn btn--ghost">
            Back to your profile
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page page--profile">
      {isDemoPublic && (
        <p className="notice profile-preview-notice">
          {DEMO_PUBLIC_PROFILE_NOTICE} This is how visitors see another member.{' '}
          <Link to="/profile">Back to your profile</Link>
        </p>
      )}
      {publicPreview && (
        <p className="notice profile-preview-notice">
          This is how other members see your profile.{' '}
          <Link to="/profile">Close preview</Link>
          {' · '}
          <Link to="/profile">Edit profile</Link>
        </p>
      )}
      <section className="profile-hero">
        <div
          className="profile-hero__banner"
          style={{ background: banner.gradient }}
          aria-hidden
        />
        <div className="profile-hero__body">
          <div className="profile-hero__identity">
            <ProfileAvatar
              url={displayAvatar}
              name={displayName}
              editable={showOwnerUi && !adminUserPreview}
              uploading={avatarUploading}
              onPick={showOwnerUi ? handleAvatarPick : undefined}
            />
            <div className="profile-hero__copy">
              <h2 className="profile-hero__name">{displayName}</h2>
              {showOwnerUi && session?.role === 'admin' && (
                <span className="profile-hero__role">Admin</span>
              )}
              {displayBio ? (
                <p className="profile-hero__bio">{displayBio}</p>
              ) : (
                <p className="profile-hero__bio profile-hero__bio--empty">
                  {showOwnerUi
                    ? 'Add a short description below.'
                    : 'No description yet.'}
                </p>
              )}
              {!isOwner && publicProfile && (
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  onClick={() =>
                    requestOpenUserDm(publicProfile.id, publicProfile.username)
                  }
                >
                  Send message
                </button>
              )}
            </div>
            <div className="profile-hero__sprite">
              {hasCharacter && appearance ? (
                <CharacterSprite appearance={appearance} size="small" />
              ) : (
                <p className="muted profile-hero__sprite-empty">No character</p>
              )}
            </div>
          </div>

          {avatarError && showOwnerUi && (
            <p className="login-error" role="alert">
              {avatarError}
            </p>
          )}

          <ul className="profile-chips" aria-label="Stats">
            {levelValue != null && (
              <li className="profile-chip">
                <span className="profile-chip__label">Level</span>
                <strong>{formatLevelDisplay(levelValue)}</strong>
              </li>
            )}
            {xpValue != null && (
              <li className="profile-chip">
                <span className="profile-chip__label">XP</span>
                <strong>{xpValue}</strong>
              </li>
            )}
            {streakValue != null && (
              <li className="profile-chip">
                <span className="profile-chip__label">Streak</span>
                <strong>{streakValue}d</strong>
              </li>
            )}
            {showOwnerUi && (
              <li className="profile-chip">
                <span className="profile-chip__label">Points</span>
                <strong>{progress.points}</strong>
              </li>
            )}
          </ul>

          <div className="profile-hero__badges">
            <h3 className="profile-hero__badges-title">Badges</h3>
            <BadgeGrid
              badges={state.badges}
              unlockedBadgeIds={shownBadgeIds}
              tasks={state.tasks}
              categories={state.categories}
              compact
              unlockedOnly
            />
          </div>
        </div>
      </section>

      {showOwnerUi && (
        <>
          <section className="card">
            <h3 className="section-title">Public profile</h3>
            <p className="muted">
              See your profile the way other members see it — banner, photo,
              bio, character, and badges.
            </p>
            <Link
              to={ownPublicPreviewPath(session)}
              className="btn btn--ghost btn--block"
            >
              Preview public profile
            </Link>
          </section>
          <section className="card profile-character">
            <h3 className="section-title">Character</h3>
            {hasCharacter && appearance ? (
              <>
                <div className="profile-character__sprite">
                  <CharacterSprite appearance={appearance} size="medium" />
                </div>
                <p className="profile-character__label">
                  {characterSizeSummary(appearance)}
                </p>
                {adminUserPreview && (
                  <p className="muted profile-character__preview-note">
                    User preview — this look is local only and is not saved.
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() =>
                    navigate('/character', { state: { from: '/profile' } })
                  }
                >
                  Change appearance
                </button>
              </>
            ) : (
              <>
                <p className="muted">
                  {adminUserPreview
                    ? 'No local preview character. You can try the creator without saving to your account.'
                    : 'No character yet. Create a paper-doll body to show here.'}
                </p>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={() =>
                    navigate('/character', { state: { from: '/profile' } })
                  }
                >
                  Create character
                </button>
              </>
            )}
          </section>

          <section className="card">
            <h3 className="section-title">Description</h3>
            <form onSubmit={(e) => void handleBioSubmit(e)}>
              <label className="field">
                <span>About you</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={BIO_MAX_LENGTH}
                  rows={3}
                  placeholder="A short public bio…"
                />
              </label>
              <p className="muted profile-bio-count">
                {bio.trim().length}/{BIO_MAX_LENGTH}
              </p>
              {bioError && (
                <p className="login-error" role="alert">
                  {bioError}
                </p>
              )}
              {bioMessage && <p className="notice">{bioMessage}</p>}
              <button
                type="submit"
                className="btn btn--primary btn--block"
                disabled={bioSaving}
              >
                {bioSaving ? 'Saving…' : 'Save description'}
              </button>
            </form>
          </section>

          <section className="card">
            <h3 className="section-title">Account</h3>
            <dl className="profile-stats">
              <div className="profile-stats__row">
                <dt>Role</dt>
                <dd>{session?.role ?? '—'}</dd>
              </div>
              <div className="profile-stats__row">
                <dt>Patreon tier</dt>
                <dd>{patreonTierLabel}</dd>
              </div>
              <div className="profile-stats__row">
                <dt>Stage</dt>
                <dd>{getStageLabel(stage)}</dd>
              </div>
              <div className="profile-stats__row">
                <dt>Malus</dt>
                <dd>{progress.malusPoints}</dd>
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
            <h3 className="section-title">All badges</h3>
            <BadgeGrid
              badges={state.badges}
              unlockedBadgeIds={unlockedBadgeIds}
              tasks={state.tasks}
              categories={state.categories}
            />
          </section>
        </>
      )}

      {!showOwnerUi && (
        <section className="card profile-character">
          <h3 className="section-title">Character</h3>
          {hasCharacter && appearance ? (
            <>
              <div className="profile-character__sprite">
                <CharacterSprite appearance={appearance} size="medium" />
              </div>
              <p className="profile-character__label">
                {characterSizeSummary(appearance)}
              </p>
            </>
          ) : (
            <p className="muted">This member has not created a character yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
