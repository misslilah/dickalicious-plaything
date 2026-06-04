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

export function FollowInstinctGameAdmin() {
  const [games, setGames] = useState<FollowInstinctGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());

  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return games;
    return games.filter(
      (game) =>
        game.title.toLowerCase().includes(query) ||
        (game.description ?? '').toLowerCase().includes(query),
    );
  }, [games, search]);

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
    setEditingId(null);
    setForm(blankForm());
  };

  const startEdit = (game: FollowInstinctGame) => {
    setEditingId(game.id);
    setForm({
      title: game.title,
      description: game.description ?? '',
      rounds: gameToDrafts(game),
    });
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
    setForm((prev) => ({
      ...prev,
      rounds: [...prev.rounds, newRoundDraft('close_eyes')],
    }));
  };

  const removeRound = (roundId: string) => {
    setForm((prev) => {
      if (prev.rounds.length <= 1) return prev;
      return { ...prev, rounds: prev.rounds.filter((round) => round.id !== roundId) };
    });
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
      <p className="muted">
        Configure photo + order rounds. Each round shows one image and one instruction during play.
        Optionally require players to type a phrase while holding the camera pose. Set the order type
        per round; players get a shuffled mix of all rounds in one session.
      </p>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="admin-form-message">{message}</p>}

      <section className="card follow-instinct-admin__form">
        <h3>{editingId ? 'Edit game' : 'New game'}</h3>
        <label className="field">
          <span>Title</span>
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Description (optional)</span>
          <textarea
            value={form.description ?? ''}
            rows={2}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </label>

        <div className="follow-instinct-admin__rounds">
          <div className="follow-instinct-admin__rounds-header">
            <h4>Photo + order rounds</h4>
            <button type="button" className="btn btn--ghost btn--small" onClick={addRound}>
              Add round
            </button>
          </div>

          {form.rounds.map((round, index) => (
            <div key={round.id} className="follow-instinct-admin__round card">
              <div className="follow-instinct-admin__round-heading">
                <strong>Round {index + 1}</strong>
                {form.rounds.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small btn--danger"
                    onClick={() => removeRound(round.id)}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="follow-instinct-admin__round-photo">
                {round.imageUrl ? (
                  <img src={round.imageUrl} alt="" />
                ) : (
                  <span className="muted">No photo</span>
                )}
              </div>
              <input
                type="file"
                accept={FOLLOW_INSTINCT_IMAGE_ACCEPT}
                onChange={(event) => onPickRoundImage(round.id, event.target.files?.[0])}
              />

              <label className="field">
                <span>Order type</span>
                <select
                  value={round.orderType}
                  onChange={(event) => {
                    const orderType = event.target.value as FollowInstinctOrderType;
                    updateRound(round.id, {
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
                <span>Order text (shown to player)</span>
                <input
                  type="text"
                  value={round.orderText}
                  onChange={(event) => updateRound(round.id, { orderText: event.target.value })}
                />
              </label>

              <label className="field">
                <span>Phrase to type (optional)</span>
                <input
                  type="text"
                  value={round.phraseToType ?? ''}
                  placeholder='e.g. "I obey" — leave blank for pose only'
                  onChange={(event) => updateRound(round.id, { phraseToType: event.target.value })}
                />
              </label>
            </div>
          ))}
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
