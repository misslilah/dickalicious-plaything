import { useEffect, useMemo, useState } from 'react';
import {
  FOLLOW_INSTINCT_IMAGE_ACCEPT,
  MAX_FOLLOW_INSTINCT_IMAGE_BYTES,
  createFollowInstinctGame,
  deleteFollowInstinctGame,
  fetchAllFollowInstinctGames,
  updateFollowInstinctGame,
  type FollowInstinctGame,
  type FollowInstinctGameInput,
} from '../../lib/followInstinctGames';

function blankForm(): FollowInstinctGameInput & {
  leftPreview?: string;
  rightPreview?: string;
} {
  return { title: '', description: '' };
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
  const [leftFile, setLeftFile] = useState<File | undefined>();
  const [rightFile, setRightFile] = useState<File | undefined>();

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
    setLeftFile(undefined);
    setRightFile(undefined);
  };

  const startEdit = (game: FollowInstinctGame) => {
    setEditingId(game.id);
    setForm({
      title: game.title,
      description: game.description ?? '',
      leftPreview: game.leftImageUrl,
      rightPreview: game.rightImageUrl,
    });
    setLeftFile(undefined);
    setRightFile(undefined);
    setMessage('');
    setError('');
  };

  const onPickImage = (side: 'left' | 'right', file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FOLLOW_INSTINCT_IMAGE_BYTES) {
      setError(`${side === 'left' ? 'Left' : 'Right'} image must be 5 MB or smaller.`);
      return;
    }
    const preview = URL.createObjectURL(file);
    if (side === 'left') {
      setLeftFile(file);
      setForm((prev) => ({ ...prev, leftPreview: preview }));
    } else {
      setRightFile(file);
      setForm((prev) => ({ ...prev, rightPreview: preview }));
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
      const result = await updateFollowInstinctGame(editingId, input, {
        leftFile,
        rightFile,
      });
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

    if (!leftFile || !rightFile) {
      setSaving(false);
      setError('Upload both left and right panel images.');
      return;
    }

    const result = await createFollowInstinctGame(input, leftFile, rightFile);
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
        Configure left and right distraction images. During play, a pink heart appears on one
        side each round; players follow voice-style commands with the camera.
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

        <div className="follow-instinct-admin__preview">
          <div className="follow-instinct-admin__preview-panel">
            <span className="follow-instinct-admin__preview-label">Left image</span>
            <div className="follow-instinct-admin__preview-slot">
              {form.leftPreview ? (
                <img src={form.leftPreview} alt="" />
              ) : (
                <span className="muted">No image</span>
              )}
            </div>
            <input
              type="file"
              accept={FOLLOW_INSTINCT_IMAGE_ACCEPT}
              onChange={(event) => onPickImage('left', event.target.files?.[0])}
            />
          </div>

          <div className="follow-instinct-admin__preview-panel">
            <span className="follow-instinct-admin__preview-label">Right image</span>
            <div className="follow-instinct-admin__preview-slot">
              {form.rightPreview ? (
                <img src={form.rightPreview} alt="" />
              ) : (
                <span className="muted">No image</span>
              )}
            </div>
            <input
              type="file"
              accept={FOLLOW_INSTINCT_IMAGE_ACCEPT}
              onChange={(event) => onPickImage('right', event.target.files?.[0])}
            />
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
                <img src={game.leftImageUrl} alt="" />
                <img src={game.rightImageUrl} alt="" />
              </div>
              <div className="admin-list-item__body">
                <strong>{game.title}</strong>
                {game.description && <p className="muted">{game.description}</p>}
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
