import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CharacterSprite } from '../components/CharacterSprite';
import { useAppStore } from '../hooks/useAppStore';
import {
  CHARACTER_BODY_SIZES,
  CHARACTER_GENDER_LABEL,
  CHARACTER_GENDERS,
  CHARACTER_MIGRATION_HINT,
  CHARACTER_SIZE_LABEL,
  CHARACTER_SIZE_SHORT,
  appearanceFromSession,
  draftAppearance,
  isCharacterComplete,
  readLocalPreviewCharacter,
  writeLocalPreviewCharacter,
} from '../lib/characterSprite';
import { updateProfileCharacter } from '../lib/profileDb';
import type { CharacterBodySize, CharacterGender } from '../types';

export function CharacterCreator() {
  const { session, adminUserPreview, refreshProfile } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? '/profile';

  const existing = adminUserPreview
    ? readLocalPreviewCharacter()
    : appearanceFromSession(session);

  const [gender, setGender] = useState<CharacterGender | null>(
    existing?.gender ?? null,
  );
  const [size, setSize] = useState<CharacterBodySize | null>(
    existing
      ? existing.gender === 'female'
        ? existing.breastSize
        : existing.penisSize
      : null,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const draft = useMemo(
    () => draftAppearance(gender, size, existing?.equipped ?? {}),
    [existing?.equipped, gender, size],
  );
  const canConfirm = isCharacterComplete(draft);
  const isEditing = isCharacterComplete(existing);
  const required = !adminUserPreview && session?.role !== 'admin' && !isEditing;

  const sizePrompt =
    gender === 'female'
      ? 'Breast size'
      : gender === 'male'
        ? 'Penis size'
        : 'Size';

  const handleConfirm = async () => {
    if (!draft || !canConfirm || !session?.userId) return;
    setError('');
    setSaving(true);

    if (adminUserPreview) {
      writeLocalPreviewCharacter(draft);
      setSaving(false);
      navigate(from, { replace: !isEditing });
      return;
    }

    const result = await updateProfileCharacter(session.userId, draft);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refreshProfile();
    navigate(isEditing ? from : '/', { replace: !isEditing });
  };

  return (
    <div className="login-page character-creator-page">
      <div className="login-card card character-creator">
        <h1 className="app-title">Create your character</h1>
        <p className="app-tagline">
          {required
            ? 'Required once — pick a body, then confirm. You start nude; clothes come later in the shop.'
            : adminUserPreview
              ? 'User preview — this look stays on this device only.'
              : 'Update your paper-doll look. Clothes will layer on top later.'}
        </p>

        <div className="character-creator__preview" aria-live="polite">
          <CharacterSprite appearance={draft} size="large" />
        </div>

        <fieldset className="character-creator__fieldset">
          <legend>Gender</legend>
          <div className="chip-row character-creator__chips">
            {CHARACTER_GENDERS.map((option) => (
              <button
                key={option}
                type="button"
                className={gender === option ? 'chip chip--active' : 'chip'}
                aria-pressed={gender === option}
                onClick={() => {
                  setGender(option);
                  setSize(null);
                  setError('');
                }}
              >
                {CHARACTER_GENDER_LABEL[option]}
              </button>
            ))}
          </div>
        </fieldset>

        {gender && (
          <fieldset className="character-creator__fieldset">
            <legend>{sizePrompt}</legend>
            <div className="chip-row character-creator__chips">
              {CHARACTER_BODY_SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={size === option ? 'chip chip--active' : 'chip'}
                  aria-pressed={size === option}
                  onClick={() => {
                    setSize(option);
                    setError('');
                  }}
                >
                  {CHARACTER_SIZE_SHORT[option]}
                  <span className="character-creator__size-full">
                    {CHARACTER_SIZE_LABEL[option]}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <div className="btn-row character-creator__actions">
          {isEditing && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => navigate(from)}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canConfirm || saving}
            onClick={() => void handleConfirm()}
          >
            {saving ? 'Saving…' : isEditing ? 'Save appearance' : 'Confirm'}
          </button>
        </div>

        {error.includes('096') && (
          <p className="muted character-creator__hint">{CHARACTER_MIGRATION_HINT}</p>
        )}
      </div>
    </div>
  );
}
