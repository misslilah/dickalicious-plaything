import { useEffect, useMemo, useState } from 'react';
import {
  MAX_PUZZLE_IMAGE_BYTES,
  PUZZLE_IMAGE_ACCEPT,
  PUZZLE_PIECE_COUNTS,
  PUZZLE_ROTATION_LABELS,
  createPuzzleGame,
  deletePuzzleGame,
  fetchAllPuzzleGames,
  puzzleDisplayTitle,
  puzzleGridSize,
  updatePuzzleGame,
  updatePuzzleSortOrders,
  type PuzzleGame,
  type PuzzleGameInput,
  type PuzzlePieceCount,
  type PuzzleRotationDirection,
} from '../../lib/puzzleGames';

function blankForm(): PuzzleGameInput & { titleInput: string; imagePreview: string | null } {
  return {
    title: null,
    titleInput: '',
    pieceCount: 9,
    rotationDirection: 'clockwise',
    isActive: true,
    imagePreview: null,
  };
}

export function PuzzleGameAdmin() {
  const [puzzles, setPuzzles] = useState<PuzzleGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const [imageFile, setImageFile] = useState<File | undefined>();

  const filteredPuzzles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return puzzles;
    return puzzles.filter((puzzle) =>
      puzzleDisplayTitle(puzzle).toLowerCase().includes(query),
    );
  }, [puzzles, search]);

  const loadPuzzles = async () => {
    setLoading(true);
    setError('');
    const result = await fetchAllPuzzleGames();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPuzzles(result.puzzles);
  };

  useEffect(() => {
    void loadPuzzles();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(blankForm());
    setImageFile(undefined);
  };

  const startEdit = (puzzle: PuzzleGame) => {
    setEditingId(puzzle.id);
    setForm({
      title: puzzle.title,
      titleInput: puzzle.title ?? '',
      pieceCount: puzzle.pieceCount,
      rotationDirection: puzzle.rotationDirection,
      isActive: puzzle.isActive,
      imagePreview: puzzle.imageUrl,
    });
    setImageFile(undefined);
    setMessage('');
    setError('');
  };

  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PUZZLE_IMAGE_BYTES) {
      setError('Image must be 5 MB or smaller.');
      return;
    }
    setImageFile(file);
    setForm((prev) => ({ ...prev, imagePreview: URL.createObjectURL(file) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    const input: PuzzleGameInput = {
      title: form.titleInput.trim() || null,
      pieceCount: form.pieceCount,
      rotationDirection: form.rotationDirection,
      isActive: form.isActive,
    };

    if (editingId) {
      const result = await updatePuzzleGame(editingId, input, imageFile);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage('Puzzle updated.');
      resetForm();
      await loadPuzzles();
      return;
    }

    if (!imageFile) {
      setSaving(false);
      setError('Upload an image for the new puzzle.');
      return;
    }

    const result = await createPuzzleGame(input, imageFile);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Puzzle created.');
    resetForm();
    await loadPuzzles();
  };

  const handleDelete = async (puzzleId: string) => {
    if (!window.confirm('Delete this puzzle?')) return;
    setError('');
    const result = await deletePuzzleGame(puzzleId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (editingId === puzzleId) resetForm();
    setMessage('Puzzle deleted.');
    await loadPuzzles();
  };

  const movePuzzle = async (puzzleId: string, direction: -1 | 1) => {
    const index = puzzles.findIndex((puzzle) => puzzle.id === puzzleId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= puzzles.length) return;
    const reordered = [...puzzles];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item!);
    setPuzzles(reordered);
    const result = await updatePuzzleSortOrders(reordered.map((puzzle) => puzzle.id));
    if (!result.ok) {
      setError(result.error);
      await loadPuzzles();
    }
  };

  return (
    <div className="puzzle-admin">
      <p className="muted">
        Upload an image and choose how many pieces to split it into. Players rearrange and rotate
        pieces until the image is restored. Set rotation direction per puzzle (clockwise,
        counter-clockwise, or position-only).
      </p>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="admin-form-message">{message}</p>}

      <section className="card puzzle-admin__form">
        <h3>{editingId ? 'Edit puzzle' : 'New puzzle'}</h3>

        <label className="field">
          <span>Title (optional)</span>
          <input
            type="text"
            value={form.titleInput}
            placeholder="Puzzle"
            onChange={(event) =>
              setForm((prev) => ({ ...prev, titleInput: event.target.value }))
            }
          />
        </label>

        <div className="puzzle-admin__preview">
          {form.imagePreview ? (
            <img src={form.imagePreview} alt="" />
          ) : (
            <span className="muted">No image selected</span>
          )}
        </div>
        <input
          type="file"
          accept={PUZZLE_IMAGE_ACCEPT}
          onChange={(event) => onPickImage(event.target.files?.[0])}
        />

        <label className="field">
          <span>Piece count</span>
          <select
            value={form.pieceCount}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                pieceCount: Number(event.target.value) as PuzzlePieceCount,
              }))
            }
          >
            {PUZZLE_PIECE_COUNTS.map((count) => {
              const size = puzzleGridSize(count);
              return (
                <option key={count} value={count}>
                  {count} pieces ({size}×{size})
                </option>
              );
            })}
          </select>
        </label>

        <label className="field">
          <span>Rotation direction</span>
          <select
            value={form.rotationDirection}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                rotationDirection: event.target.value as PuzzleRotationDirection,
              }))
            }
          >
            {(Object.keys(PUZZLE_ROTATION_LABELS) as PuzzleRotationDirection[]).map((value) => (
              <option key={value} value={value}>
                {PUZZLE_ROTATION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, isActive: event.target.checked }))
            }
          />
          <span>Visible to players</span>
        </label>

        <div className="puzzle-admin__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create puzzle'}
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
          <h3>Puzzles</h3>
          <input
            type="search"
            className="admin-search"
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {loading && <p className="muted">Loading…</p>}
        {!loading && filteredPuzzles.length === 0 && (
          <p className="muted">No puzzles yet.</p>
        )}
        <ul className="admin-list">
          {filteredPuzzles.map((puzzle, index) => (
            <li key={puzzle.id} className="admin-list-item">
              <div className="puzzle-admin__list-thumb">
                <img src={puzzle.imageUrl} alt="" />
              </div>
              <div className="admin-list-item__body">
                <strong>{puzzleDisplayTitle(puzzle)}</strong>
                <p className="muted">
                  {puzzle.pieceCount} pieces ({puzzleGridSize(puzzle.pieceCount)}×
                  {puzzleGridSize(puzzle.pieceCount)}) ·{' '}
                  {PUZZLE_ROTATION_LABELS[puzzle.rotationDirection]}
                  {!puzzle.isActive && ' · Hidden'}
                </p>
              </div>
              <div className="admin-list-item__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={index === 0}
                  onClick={() => void movePuzzle(puzzle.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={index === puzzles.length - 1}
                  onClick={() => void movePuzzle(puzzle.id, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => startEdit(puzzle)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small btn--danger"
                  onClick={() => void handleDelete(puzzle.id)}
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
