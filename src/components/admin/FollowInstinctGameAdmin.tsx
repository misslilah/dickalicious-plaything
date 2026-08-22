import { useEffect, useMemo, useState } from 'react';
import {
  FOLLOW_INSTINCT_IMAGE_ACCEPT,
  FOLLOW_INSTINCT_ORDER_LABELS,
  MAX_FOLLOW_INSTINCT_IMAGE_BYTES,
  createFollowInstinctGame,
  deleteFollowInstinctGame,
  fetchAllFollowInstinctGames,
  newRoundDraft,
  updateFollowInstinctGame,
  type FollowInstinctGame,
  type FollowInstinctGameInput,
  type FollowInstinctOrderType,
  type FollowInstinctRoundDraft,
} from '../../lib/followInstinctGames';

const ORDER_SHORT_LABELS: Record<FollowInstinctOrderType, string> = {
  close_eyes: 'Eyes',
  open_mouth: 'Mouth',
  tongue_out: 'Tongue',
};

function blankForm(): FollowInstinctGameInput & { rounds: FollowInstinctRoundDraft[] } {
  return {
    title: '',
    description: '',
    rounds: [newRoundDraft('close_eyes'), newRoundDraft('open_mouth')],
  };
}

function gameToDrafts(game: FollowInstinctGame): FollowInstinctRoundDraft[] {
  return game.rounds.map((round) => ({
    id: crypto.randomUUID(),
    orderType: round.orderType,
    orderText: round.orderText,
    phraseToType: round.phraseToType ?? '',
    imagePath: round.imagePath,
    imageUrl: round.imageUrl,
  }));
}

function summarizeOrderTypes(rounds: { orderType: FollowInstinctOrderType }[]): string {
  const labels = [...new Set(rounds.map((round) => FOLLOW_INSTINCT_ORDER_LABELS[round.orderType]))];
  return labels.join(', ');
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M18 7l-1 14H7L6 7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function FollowInstinctGameAdmin() {
  const [games, setGames] = useState<FollowInstinctGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return games;
    return games.filter(
      (game) =>
        game.title.toLowerCase().includes(query) ||
        (game.description ?? '').toLowerCase().includes(query),
    );
  }, [games, search]);

  const selectedRound = useMemo(() => {
    if (!selectedRoundId) return null;
    return form.rounds.find((round) => round.id === selectedRoundId) ?? null;
  }, [form.rounds, selectedRoundId]);

  const selectedRoundIndex = selectedRound
    ? form.rounds.findIndex((round) => round.id === selectedRound.id)
    : -1;

  const loadGames = async () => {
    setLoading(true);
    setError('');
    const result = await fetchAllFollowInstinctGames();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGames(result.games);
  };

  useEffect(() => {
    void loadGames();
  }, []);

  const resetForm = () => {
    const next = blankForm();
    setEditingId(null);
    setForm(next);
    setSelectedRoundId(null);
  };

  const startEdit = (game: FollowInstinctGame) => {
    const rounds = gameToDrafts(game);
    setEditingId(game.id);
    setForm({
      title: game.title,
      description: game.description ?? '',
      rounds,
    });
    setSelectedRoundId(null);
    setMessage('');
    setError('');
  };

  const onPickRoundImage = (roundId: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FOLLOW_INSTINCT_IMAGE_BYTES) {
      setError('Round photo must be 5 MB or smaller.');
      return;
    }
    const preview = URL.createObjectURL(file);
    setForm((prev) => ({
      ...prev,
      rounds: prev.rounds.map((round) =>
        round.id === roundId ? { ...round, file, imageUrl: preview } : round,
      ),
    }));
  };

  const updateRound = (roundId: string, patch: Partial<FollowInstinctRoundDraft>) => {
    setForm((prev) => ({
      ...prev,
      rounds: prev.rounds.map((round) => (round.id === roundId ? { ...round, ...patch } : round)),
    }));
  };

  const addRound = () => {
    const round = newRoundDraft('close_eyes');
    setForm((prev) => ({
      ...prev,
      rounds: [...prev.rounds, round],
    }));
    setSelectedRoundId(round.id);
  };

  const removeRound = (roundId: string) => {
    const remaining = form.rounds.filter((round) => round.id !== roundId);
    if (remaining.length === form.rounds.length) return;
    if (remaining.length === 0) return;
    const removedIndex = form.rounds.findIndex((round) => round.id === roundId);
    setForm((prev) => ({ ...prev, rounds: prev.rounds.filter((round) => round.id !== roundId) }));
    if (selectedRoundId === roundId) {
      const fallback = remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)];
      setSelectedRoundId(fallback?.id ?? null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    const input: FollowInstinctGameInput = {
      title: form.title,
      description: form.description?.trim() ? form.description : null,
    };

    if (editingId) {
      const result = await updateFollowInstinctGame(editingId, input, form.rounds);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage('Game updated.');
      resetForm();
      await loadGames();
      return;
    }

    const result = await createFollowInstinctGame(input, form.rounds);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Game created.');
    resetForm();
    await loadGames();
  };

  const handleDelete = async (gameId: string) => {
    if (!window.confirm('Delete this Follow your instinct game?')) return;
    setError('');
    const result = await deleteFollowInstinctGame(gameId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (editingId === gameId) resetForm();
    setMessage('Game deleted.');
    await loadGames();
  };

  return (
    <div className="follow-instinct-admin">
      <p className="muted follow-instinct-admin__intro">
        Each round is one photo and one camera order. Click a round to edit. Players get a shuffled
        mix of all rounds.
      </p>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="admin-form-message">{message}</p>}

      <section className="card follow-instinct-admin__form">
        <h3>{editingId ? 'Edit game' : 'New game'}</h3>
        <div className="follow-instinct-admin__meta">
          <label className="field follow-instinct-admin__title">
            <span>Title</span>
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>
          <label className="field follow-instinct-admin__desc">
            <span>Description (optional)</span>
            <textarea
              value={form.description ?? ''}
              rows={2}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="follow-instinct-admin__rounds">
          <div className="follow-instinct-admin__rounds-header">
            <h4>Photo + order rounds</h4>
            <button type="button" className="btn btn--ghost btn--small" onClick={addRound}>
              Add round
            </button>
          </div>
          <p className="muted follow-instinct-admin__rounds-hint">
            Compact list — click a row to edit that round.
          </p>

          <div className="follow-instinct-admin__rounds-layout">
            <ul className="follow-instinct-admin__rows">
              {form.rounds.map((round, index) => {
                const selected = round.id === selectedRound?.id;
                const label = `Round ${index + 1}`;
                const phrase = round.phraseToType?.trim() ?? '';
                const missingPhoto = !round.imageUrl;
                return (
                  <li
                    key={round.id}
                    className={
                      selected
                        ? 'follow-instinct-admin__row follow-instinct-admin__row--selected'
                        : 'follow-instinct-admin__row'
                    }
                  >
                    <button
                      type="button"
                      className="follow-instinct-admin__row-summary"
                      onClick={() =>
                        setSelectedRoundId((current) => (current === round.id ? null : round.id))
                      }
                      aria-pressed={selected}
                      aria-label={`Edit ${label}: ${FOLLOW_INSTINCT_ORDER_LABELS[round.orderType]}`}
                    >
                      {round.imageUrl ? (
                        <img
                          src={round.imageUrl}
                          alt=""
                          className="follow-instinct-admin__row-thumb"
                        />
                      ) : (
                        <span className="follow-instinct-admin__row-thumb follow-instinct-admin__row-thumb--empty">
                          —
                        </span>
                      )}
                      <span className="follow-instinct-admin__row-index">{index + 1}</span>
                      <span className="follow-instinct-admin__row-type">
                        {ORDER_SHORT_LABELS[round.orderType]}
                      </span>
                      <span
                        className={
                          missingPhoto
                            ? 'follow-instinct-admin__row-detail follow-instinct-admin__row-detail--muted'
                            : 'follow-instinct-admin__row-detail'
                        }
                      >
                        {phrase || (missingPhoto ? 'No photo' : round.orderText)}
                      </span>
                    </button>
                    {form.rounds.length > 1 && (
                      <button
                        type="button"
                        className="follow-instinct-admin__row-remove"
                        onClick={() => removeRound(round.id)}
                        aria-label={`Remove ${label}`}
                        title="Remove"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {selectedRound ? (
              <div className="follow-instinct-admin__selected">
                <div className="follow-instinct-admin__selected-bar">
                  <strong>
                    Round {selectedRoundIndex + 1} ·{' '}
                    {FOLLOW_INSTINCT_ORDER_LABELS[selectedRound.orderType]}
                  </strong>
                  <div className="follow-instinct-admin__selected-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => setSelectedRoundId(null)}
                    >
                      Done
                    </button>
                    {form.rounds.length > 1 && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small btn--danger"
                        onClick={() => removeRound(selectedRound.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="follow-instinct-admin__selected-body">
                  <div className="follow-instinct-admin__photo-col">
                    <div className="follow-instinct-admin__round-photo">
                      {selectedRound.imageUrl ? (
                        <img src={selectedRound.imageUrl} alt="" />
                      ) : (
                        <span className="muted">No photo</span>
                      )}
                    </div>
                    <label className="btn btn--ghost btn--small follow-instinct-admin__replace">
                      {selectedRound.imageUrl ? 'Replace photo' : 'Add photo'}
                      <input
                        type="file"
                        accept={FOLLOW_INSTINCT_IMAGE_ACCEPT}
                        className="visually-hidden"
                        onChange={(event) => {
                          onPickRoundImage(selectedRound.id, event.target.files?.[0]);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <div className="follow-instinct-admin__round-fields">
                    <label className="field">
                      <span>Order type</span>
                      <select
                        value={selectedRound.orderType}
                        onChange={(event) => {
                          const orderType = event.target.value as FollowInstinctOrderType;
                          updateRound(selectedRound.id, {
                            orderType,
                            orderText: FOLLOW_INSTINCT_ORDER_LABELS[orderType],
                          });
                        }}
                      >
                        {(Object.keys(FOLLOW_INSTINCT_ORDER_LABELS) as FollowInstinctOrderType[]).map(
                          (type) => (
                            <option key={type} value={type}>
                              {FOLLOW_INSTINCT_ORDER_LABELS[type]}
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <label className="field">
                      <span>Order text</span>
                      <input
                        type="text"
                        value={selectedRound.orderText}
                        onChange={(event) =>
                          updateRound(selectedRound.id, { orderText: event.target.value })
                        }
                      />
                    </label>

                    <label className="field follow-instinct-admin__phrase">
                      <span>Phrase to type (optional)</span>
                      <input
                        type="text"
                        value={selectedRound.phraseToType ?? ''}
                        placeholder='e.g. "I obey" — leave blank for pose only'
                        onChange={(event) =>
                          updateRound(selectedRound.id, { phraseToType: event.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted follow-instinct-admin__empty-editor">
                Click a round to edit its photo, order, and optional phrase.
              </p>
            )}
          </div>
        </div>

        <div className="follow-instinct-admin__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create game'}
          </button>
          {editingId && (
            <button type="button" className="btn btn--ghost" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <div className="admin-list-header">
          <h3>Games</h3>
          <input
            type="search"
            className="admin-search"
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {loading && <p className="muted">Loading…</p>}
        {!loading && filteredGames.length === 0 && (
          <p className="muted">No Follow your instinct games yet.</p>
        )}
        <ul className="admin-list">
          {filteredGames.map((game) => (
            <li key={game.id} className="admin-list-item">
              <div className="follow-instinct-admin__list-thumb">
                <img src={game.rounds[0]?.imageUrl} alt="" />
              </div>
              <div className="admin-list-item__body">
                <strong>{game.title}</strong>
                {game.description && <p className="muted">{game.description}</p>}
                <p className="muted">
                  {game.rounds.length} round{game.rounds.length === 1 ? '' : 's'} ·{' '}
                  {summarizeOrderTypes(game.rounds)}
                </p>
              </div>
              <div className="admin-list-item__actions">
                <button type="button" className="btn btn--ghost btn--small" onClick={() => startEdit(game)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small btn--danger"
                  onClick={() => void handleDelete(game.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
