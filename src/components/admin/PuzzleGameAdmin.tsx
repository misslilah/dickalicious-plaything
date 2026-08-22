import { useEffect, useMemo, useRef, useState } from 'react';
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

const ROTATION_SHORT_LABELS: Record<PuzzleRotationDirection, string> = {
  clockwise: 'CW',
  counterclockwise: 'CCW',
  none: 'Pos',
};

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

export function PuzzleGameAdmin() {
  const [puzzles, setPuzzles] = useState<PuzzleGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [imageFile, setImageFile] = useState<File | undefined>();
  const editorRef = useRef<HTMLDivElement>(null);
  const blobPreviewRef = useRef<string | null>(null);

  const filteredPuzzles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return puzzles;
    return puzzles.filter((puzzle) =>
      puzzleDisplayTitle(puzzle).toLowerCase().includes(query),
    );
  }, [puzzles, search]);

  const selectedPuzzle = editingId
    ? puzzles.find((puzzle) => puzzle.id === editingId) ?? null
    : null;
  const selectedIndex = selectedPuzzle
    ? puzzles.findIndex((puzzle) => puzzle.id === selectedPuzzle.id)
    : -1;
  const showEditor = isCreating || editingId != null;

  const clearBlobPreview = () => {
    if (blobPreviewRef.current) {
      URL.revokeObjectURL(blobPreviewRef.current);
      blobPreviewRef.current = null;
    }
  };

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

  useEffect(
    () => () => {
      if (blobPreviewRef.current) URL.revokeObjectURL(blobPreviewRef.current);
    },
    [],
  );

  const scrollEditorIntoView = () => {
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const resetForm = () => {
    clearBlobPreview();
    setEditingId(null);
    setIsCreating(false);
    setForm(blankForm());
    setImageFile(undefined);
  };

  const startCreate = () => {
    clearBlobPreview();
    setEditingId(null);
    setIsCreating(true);
    setForm(blankForm());
    setImageFile(undefined);
    setMessage('');
    setError('');
    scrollEditorIntoView();
  };

  const startEdit = (puzzle: PuzzleGame) => {
    clearBlobPreview();
    setIsCreating(false);
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
    scrollEditorIntoView();
  };

  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_PUZZLE_IMAGE_BYTES) {
      setError('Image must be 5 MB or smaller.');
      return;
    }
    clearBlobPreview();
    const preview = URL.createObjectURL(file);
    blobPreviewRef.current = preview;
    setImageFile(file);
    setForm((prev) => ({ ...prev, imagePreview: preview }));
    setError('');
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

  const gridSize = puzzleGridSize(form.pieceCount);
  const editorTitle = isCreating
    ? 'New puzzle'
    : selectedPuzzle
      ? `Editing ${puzzleDisplayTitle(selectedPuzzle)}`
      : 'Edit puzzle';

  return (
    <div className="puzzle-admin">
      <p className="muted puzzle-admin__intro">
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

      <section className="card puzzle-admin__library">
        <div className="puzzle-admin__library-header">
          <div className="puzzle-admin__library-title">
            <h3>Puzzles</h3>
            <span className="admin-count" aria-live="polite">
              {puzzles.length}
            </span>
          </div>
          <div className="puzzle-admin__library-tools">
            <input
              type="search"
              className="admin-search"
              placeholder="Search…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search puzzles"
            />
            <button type="button" className="btn btn--ghost btn--small" onClick={startCreate}>
              Add puzzle
            </button>
          </div>
        </div>
        <p className="muted puzzle-admin__hint">Click a thumbnail to edit that puzzle.</p>

        {loading && <p className="muted">Loading…</p>}
        {!loading && filteredPuzzles.length === 0 && (
          <p className="muted">No puzzles yet.</p>
        )}

        <ul className="puzzle-admin__grid">
          {filteredPuzzles.map((puzzle) => {
            const selected = puzzle.id === editingId;
            const size = puzzleGridSize(puzzle.pieceCount);
            const label = puzzleDisplayTitle(puzzle);
            return (
              <li
                key={puzzle.id}
                className={
                  selected
                    ? 'puzzle-admin__cell puzzle-admin__cell--selected'
                    : 'puzzle-admin__cell'
                }
              >
                <button
                  type="button"
                  className="puzzle-admin__cell-preview"
                  onClick={() => startEdit(puzzle)}
                  aria-pressed={selected}
                  aria-label={`Edit ${label}: ${puzzle.pieceCount} pieces, ${PUZZLE_ROTATION_LABELS[puzzle.rotationDirection]}`}
                  title={`${label} · ${puzzle.pieceCount} pieces · ${PUZZLE_ROTATION_LABELS[puzzle.rotationDirection]}`}
                >
                  {puzzle.imageUrl ? (
                    <img src={puzzle.imageUrl} alt="" className="puzzle-admin__cell-thumb" />
                  ) : (
                    <span className="puzzle-admin__cell-empty">No image</span>
                  )}
                </button>
                <span className="puzzle-admin__cell-meta">
                  <span className="puzzle-admin__cell-index">
                    {size}×{size}
                  </span>
                  <span className="puzzle-admin__cell-type">
                    {ROTATION_SHORT_LABELS[puzzle.rotationDirection]}
                  </span>
                  {!puzzle.isActive && (
                    <span className="puzzle-admin__cell-hidden" title="Hidden from players">
                      Off
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="puzzle-admin__cell-remove"
                  onClick={() => void handleDelete(puzzle.id)}
                  aria-label={`Delete ${label}`}
                  title="Delete"
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ul>

        {showEditor && (
          <div ref={editorRef} className="puzzle-admin__selected">
            <div className="puzzle-admin__selected-bar">
              <strong>{editorTitle}</strong>
              <div className="btn-row">
                {editingId && selectedIndex >= 0 && (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      disabled={selectedIndex === 0}
                      onClick={() => void movePuzzle(editingId, -1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      disabled={selectedIndex === puzzles.length - 1}
                      onClick={() => void movePuzzle(editingId, 1)}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small btn--danger"
                      onClick={() => void handleDelete(editingId)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="puzzle-admin__selected-body">
              <div className="puzzle-admin__photo-col">
                <div className="puzzle-admin__photo">
                  {form.imagePreview ? (
                    <img src={form.imagePreview} alt="" />
                  ) : (
                    <span className="muted">No image</span>
                  )}
                </div>
                <label className="btn btn--ghost btn--small puzzle-admin__replace">
                  {form.imagePreview ? 'Replace image' : 'Add image'}
                  <input
                    type="file"
                    accept={PUZZLE_IMAGE_ACCEPT}
                    className="visually-hidden"
                    onChange={(event) => {
                      onPickImage(event.target.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>

              <div className="puzzle-admin__fields">
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
                    {(Object.keys(PUZZLE_ROTATION_LABELS) as PuzzleRotationDirection[]).map(
                      (value) => (
                        <option key={value} value={value}>
                          {PUZZLE_ROTATION_LABELS[value]}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="field field--checkbox puzzle-admin__visible">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                  />
                  <span>Visible to players</span>
                </label>
              </div>
            </div>

            <p className="muted puzzle-admin__editor-hint">
              {form.imagePreview
                ? `Players will solve a ${form.pieceCount}-piece (${gridSize}×${gridSize}) board.`
                : 'An image is required to create a puzzle.'}
            </p>

            <div className="puzzle-admin__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create puzzle'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
