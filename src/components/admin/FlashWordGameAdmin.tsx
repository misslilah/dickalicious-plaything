import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_FLASH_DURATION_MS,
  DEFAULT_ZONE,
  FLASH_GAME_IMAGE_ACCEPT,
  MAX_FLASH_DURATION_MS,
  MAX_FLASH_GAME_IMAGE_BYTES,
  MIN_FLASH_DURATION_MS,
  createFlashWordGame,
  deleteFlashWordGame,
  deleteSavedCombination,
  fetchAllFlashWordGames,
  fetchSavedCombinations,
  saveCombinationToLibrary,
  saveCombinationsToLibrary,
  updateFlashWordGame,
  type CardFileEntry,
  type FlashWordCard,
  type FlashWordDistractionZoneInput,
  type FlashWordGame,
  type FlashWordGameInput,
  type FlashWordSavedCombination,
  type FlashWordTripletInput,
  type FlashWordZone,
} from '../../lib/flashWordGames';
import { FlashWordZoneEditor } from '../FlashWordZoneEditor';

const EMPTY_TRIPLET: FlashWordTripletInput = {
  word1: '',
  word2: '',
  word3: '',
};

type CardFormEntry = {
  id?: string;
  imageUrl?: string;
  zone: FlashWordZone;
  distractionZones: FlashWordDistractionZoneInput[];
  pendingFile?: File;
  pendingPreviewUrl?: string;
};

function blankForm(): {
  title: string;
  description: string;
  flashDurationMs: number;
  distractionZonesEnabled: boolean;
  cards: CardFormEntry[];
  triplets: FlashWordTripletInput[];
} {
  return {
    title: '',
    description: '',
    flashDurationMs: DEFAULT_FLASH_DURATION_MS,
    distractionZonesEnabled: false,
    cards: [],
    triplets: [{ ...EMPTY_TRIPLET }],
  };
}

function cardToFormEntry(card: FlashWordCard): CardFormEntry {
  return {
    id: card.id,
    imageUrl: card.imageUrl,
    zone: { ...card.zone },
    distractionZones: card.distractionZones.map((zone) => ({
      id: zone.id,
      zone: { ...zone.zone },
      word: zone.word,
    })),
  };
}

function gameToForm(game: FlashWordGame) {
  return {
    title: game.title,
    description: game.description ?? '',
    flashDurationMs: game.flashDurationMs,
    distractionZonesEnabled: game.distractionZonesEnabled,
    cards: game.cards.map(cardToFormEntry),
    triplets: game.triplets.map((triplet) => ({
      id: triplet.id,
      word1: triplet.word1,
      word2: triplet.word2,
      word3: triplet.word3,
    })),
  };
}

function formatCombinationLabel(combination: FlashWordSavedCombination): string {
  return `${combination.word1} · ${combination.word2} · ${combination.word3}`;
}

function tripletMatchesSaved(
  triplet: FlashWordTripletInput,
  combination: FlashWordSavedCombination,
): boolean {
  return (
    triplet.word1.trim().toLowerCase() === combination.word1.toLowerCase() &&
    triplet.word2.trim().toLowerCase() === combination.word2.toLowerCase() &&
    triplet.word3.trim().toLowerCase() === combination.word3.toLowerCase()
  );
}

export function FlashWordGameAdmin() {
  const [games, setGames] = useState<FlashWordGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blankForm());
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const [savedCombinations, setSavedCombinations] = useState<FlashWordSavedCombination[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [saveToLibraryOnCreate, setSaveToLibraryOnCreate] = useState(true);

  const editingGame = useMemo(
    () => games.find((game) => game.id === editingId) ?? null,
    [games, editingId],
  );

  const selectedCard = form.cards[selectedCardIndex] ?? null;
  const zoneImageUrl =
    selectedCard?.pendingPreviewUrl ?? selectedCard?.imageUrl ?? null;

  const loadSavedCombinations = async () => {
    setLibraryLoading(true);
    const result = await fetchSavedCombinations();
    setLibraryLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedCombinations(result.combinations);
  };

  const loadGames = async () => {
    setLoading(true);
    setError('');
    const result = await fetchAllFlashWordGames();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGames(result.games);
  };

  useEffect(() => {
    void loadGames();
    void loadSavedCombinations();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return games;
    return games.filter(
      (game) =>
        game.title.toLowerCase().includes(q) ||
        (game.description ?? '').toLowerCase().includes(q),
    );
  }, [games, search]);

  const startCreate = () => {
    setEditingId(null);
    setForm(blankForm());
    setSelectedCardIndex(0);
    setMessage('');
    setError('');
  };

  const startEdit = (game: FlashWordGame) => {
    setEditingId(game.id);
    setForm(gameToForm(game));
    setSelectedCardIndex(0);
    setMessage('');
    setError('');
  };

  const updateTriplet = (index: number, patch: Partial<FlashWordTripletInput>) => {
    setForm((prev) => ({
      ...prev,
      triplets: prev.triplets.map((triplet, i) =>
        i === index ? { ...triplet, ...patch } : triplet,
      ),
    }));
  };

  const addTriplet = (triplet: FlashWordTripletInput = { ...EMPTY_TRIPLET }) => {
    setForm((prev) => ({
      ...prev,
      triplets: [...prev.triplets, { ...triplet }],
    }));
  };

  const removeTriplet = (index: number) => {
    setForm((prev) => ({
      ...prev,
      triplets: prev.triplets.filter((_, i) => i !== index),
    }));
  };

  const updateCardZone = (index: number, zone: FlashWordZone) => {
    setForm((prev) => ({
      ...prev,
      cards: prev.cards.map((card, i) => (i === index ? { ...card, zone } : card)),
    }));
  };

  const updateCardDistractionZones = (
    index: number,
    distractionZones: FlashWordDistractionZoneInput[],
  ) => {
    setForm((prev) => ({
      ...prev,
      cards: prev.cards.map((card, i) =>
        i === index ? { ...card, distractionZones } : card,
      ),
    }));
  };

  const addCardFromFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.');
      return;
    }
    if (file.size > MAX_FLASH_GAME_IMAGE_BYTES) {
      setError(`Image too large. Max ${MAX_FLASH_GAME_IMAGE_BYTES / (1024 * 1024)} MB.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setForm((prev) => {
      const nextCards = [
        ...prev.cards,
        {
          zone: { ...DEFAULT_ZONE },
          distractionZones: [],
          pendingFile: file,
          pendingPreviewUrl: previewUrl,
        },
      ];
      setSelectedCardIndex(nextCards.length - 1);
      return { ...prev, cards: nextCards };
    });
    setError('');
  };

  const replaceCardFile = (index: number, file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.');
      return;
    }
    if (file.size > MAX_FLASH_GAME_IMAGE_BYTES) {
      setError(`Image too large. Max ${MAX_FLASH_GAME_IMAGE_BYTES / (1024 * 1024)} MB.`);
      return;
    }

    setForm((prev) => ({
      ...prev,
      cards: prev.cards.map((card, i) => {
        if (i !== index) return card;
        if (card.pendingPreviewUrl) URL.revokeObjectURL(card.pendingPreviewUrl);
        return {
          ...card,
          pendingFile: file,
          pendingPreviewUrl: URL.createObjectURL(file),
        };
      }),
    }));
    setError('');
  };

  const removeCard = (index: number) => {
    setForm((prev) => {
      const card = prev.cards[index];
      if (card?.pendingPreviewUrl) URL.revokeObjectURL(card.pendingPreviewUrl);
      const nextCards = prev.cards.filter((_, i) => i !== index);
      setSelectedCardIndex((current) => {
        if (nextCards.length === 0) return 0;
        if (current > index) return current - 1;
        if (current >= nextCards.length) return nextCards.length - 1;
        return current;
      });
      return { ...prev, cards: nextCards };
    });
  };

  const importFromLibrary = (combination: FlashWordSavedCombination) => {
    const alreadyAdded = form.triplets.some((triplet) =>
      tripletMatchesSaved(triplet, combination),
    );
    if (alreadyAdded) {
      setMessage('That combination is already in this game.');
      return;
    }

    addTriplet({
      word1: combination.word1,
      word2: combination.word2,
      word3: combination.word3,
    });
    setMessage('Combination added to this game.');
  };

  const saveTripletToLibrary = async (index: number) => {
    setLibraryBusy(true);
    setError('');
    const result = await saveCombinationToLibrary(form.triplets[index]!);
    setLibraryBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (result.duplicate) {
      setMessage('Combination is already in the library.');
      return;
    }

    setSavedCombinations((prev) => [result.combination, ...prev]);
    setMessage('Combination saved to library.');
  };

  const saveAllTripletsToLibrary = async () => {
    setLibraryBusy(true);
    setError('');
    const result = await saveCombinationsToLibrary(form.triplets);
    setLibraryBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await loadSavedCombinations();

    const parts: string[] = [];
    if (result.savedCount > 0) {
      parts.push(
        `${result.savedCount} combination${result.savedCount === 1 ? '' : 's'} saved to library`,
      );
    }
    if (result.duplicateCount > 0) {
      parts.push(`${result.duplicateCount} already in library`);
    }
    if (result.skippedCount > 0) {
      parts.push(`${result.skippedCount} skipped (incomplete or invalid)`);
    }
    setMessage(parts.length > 0 ? parts.join(' · ') : 'No combinations to save.');
  };

  const removeFromLibrary = async (combination: FlashWordSavedCombination) => {
    if (!window.confirm(`Remove "${formatCombinationLabel(combination)}" from the library?`)) {
      return;
    }

    setLibraryBusy(true);
    setError('');
    const result = await deleteSavedCombination(combination.id);
    setLibraryBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSavedCombinations((prev) => prev.filter((item) => item.id !== combination.id));
    setMessage('Combination removed from library.');
  };

  const buildInput = (): FlashWordGameInput => ({
    title: form.title,
    description: form.description.trim() || null,
    flashDurationMs: form.flashDurationMs,
    distractionZonesEnabled: form.distractionZonesEnabled,
    cards: form.cards.map((card) => ({
      id: card.id,
      zone: card.zone,
      distractionZones: form.distractionZonesEnabled ? card.distractionZones : [],
    })),
    triplets: form.triplets,
  });

  const buildCardFiles = (): CardFileEntry[] =>
    form.cards
      .map((card, index) =>
        card.pendingFile ? { cardIndex: index, file: card.pendingFile } : null,
      )
      .filter((entry): entry is CardFileEntry => entry != null);

  const save = async () => {
    setError('');
    setMessage('');

    if (form.cards.length === 0) {
      setError('Add at least one flash card image.');
      return;
    }

    const newCardsWithoutFile = form.cards.some(
      (card, index) => !card.id && !card.pendingFile,
    );
    if (newCardsWithoutFile) {
      setError('Each new flash card needs an image upload.');
      return;
    }

    setSaving(true);
    const input = buildInput();
    const cardFiles = buildCardFiles();
    const wasEditing = editingId != null;
    const result = editingId
      ? await updateFlashWordGame(editingId, input, cardFiles)
      : await createFlashWordGame(input, cardFiles);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (!wasEditing && saveToLibraryOnCreate) {
      const libraryResult = await saveCombinationsToLibrary(input.triplets);
      if (libraryResult.ok) {
        await loadSavedCombinations();
        if (libraryResult.savedCount > 0) {
          setMessage(
            `Game created. ${libraryResult.savedCount} combination${libraryResult.savedCount === 1 ? '' : 's'} added to library.`,
          );
        } else {
          setMessage('Game created.');
        }
      } else {
        setMessage('Game created, but saving combinations to the library failed.');
        setError(libraryResult.error);
      }
    } else {
      setMessage(wasEditing ? 'Game updated.' : 'Game created.');
    }

    setGames((prev) => {
      const without = prev.filter((game) => game.id !== result.game.id);
      return [result.game, ...without];
    });
    setEditingId(result.game.id);
    setForm(gameToForm(result.game));
    setSelectedCardIndex(0);
  };

  const remove = async (game: FlashWordGame) => {
    if (!window.confirm(`Delete "${game.title}"?`)) return;
    setError('');
    setMessage('');
    const result = await deleteFlashWordGame(game.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGames((prev) => prev.filter((g) => g.id !== game.id));
    if (editingId === game.id) startCreate();
    setMessage('Game deleted.');
  };

  return (
    <>
      <section className="card admin-list-card">
        <header className="admin-list-card__header">
          <div className="admin-list-card__title-row">
            <h3 className="section-title">Flash Cards games</h3>
            <span className="admin-count" aria-live="polite">
              {games.length}
            </span>
          </div>
          <p className="muted admin-list-card__intro">
            Build a library of flash card images (each with its own highlight zone) and define
            word combinations separately.
          </p>
          <label className="field admin-list-card__search">
            <span className="visually-hidden">Search flash cards games</span>
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search flash cards games"
            />
          </label>
        </header>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="muted">No flash cards games yet.</p>
        ) : (
          <ul className="admin-library">
            {filtered.map((game) => (
              <li key={game.id} className="admin-library-item">
                <div className="admin-library-item__main flash-game-admin-item__main">
                  <img
                    src={game.cards[0]?.imageUrl}
                    alt=""
                    className="flash-game-admin-item__thumb"
                  />
                  <div>
                    <strong>{game.title}</strong>
                    <p className="muted flash-game-admin-item__meta">
                      {game.cards.length} card{game.cards.length === 1 ? '' : 's'} ·{' '}
                      {game.triplets.length} combination
                      {game.triplets.length === 1 ? '' : 's'} · {game.flashDurationMs} ms flash
                    </p>
                  </div>
                </div>
                <div className="btn-row admin-library-item__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => startEdit(game)}
                  >
                    Edit
                  </button>
                  <Link
                    to={`/mini-games/${game.id}`}
                    className="btn btn--ghost btn--small"
                  >
                    Play
                  </Link>
                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    onClick={() => void remove(game)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card admin-form-block">
        <header className="admin-form-actions">
          <h3 className="section-title">
            {editingId ? 'Edit game' : 'New Flash Cards game'}
          </h3>
          {editingId && (
            <button type="button" className="btn btn--ghost btn--small" onClick={startCreate}>
              New game
            </button>
          )}
        </header>

        {message && <p className="admin-form-message">{message}</p>}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <label className="form-field">
          Title
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Game title"
          />
        </label>

        <label className="form-field">
          Description <span className="muted">(optional)</span>
          <textarea
            value={form.description}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Short description for players"
            rows={2}
          />
        </label>

        <label className="form-field">
          Flash duration (ms)
          <input
            type="number"
            min={MIN_FLASH_DURATION_MS}
            max={MAX_FLASH_DURATION_MS}
            step={10}
            value={form.flashDurationMs}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                flashDurationMs: Number(e.target.value),
              }))
            }
          />
        </label>

        <label className="flash-game-rounds__checkbox">
          <input
            type="checkbox"
            checked={form.distractionZonesEnabled}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                distractionZonesEnabled: e.target.checked,
              }))
            }
          />
          Enable distraction zones
        </label>
        {form.distractionZonesEnabled && (
          <p className="muted">
            Add green highlight zones on each card with their own distracting words. They flash
            during the wait before the main word and do not appear in the three answer choices.
          </p>
        )}

        <div className="flash-game-cards">
          <div className="flash-game-cards__header">
            <h4 className="section-title">Card library</h4>
            <label className="btn btn--ghost btn--small flash-game-cards__add">
              Add card
              <input
                type="file"
                accept={FLASH_GAME_IMAGE_ACCEPT}
                className="visually-hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addCardFromFile(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <p className="muted">
            Upload one or more images. Each card has its own draggable flash zone. At least one
            card is required to play.
          </p>

          {form.cards.length === 0 ? (
            <p className="muted flash-game-cards__empty">No cards yet — add an image above.</p>
          ) : (
            <>
              <ul className="flash-game-cards__list">
                {form.cards.map((card, index) => (
                  <li key={card.id ?? `new-${index}`} className="flash-game-cards__item">
                    <button
                      type="button"
                      className={
                        index === selectedCardIndex
                          ? 'flash-game-cards__thumb-btn flash-game-cards__thumb-btn--active'
                          : 'flash-game-cards__thumb-btn'
                      }
                      onClick={() => setSelectedCardIndex(index)}
                      aria-pressed={index === selectedCardIndex}
                    >
                      <img
                        src={card.pendingPreviewUrl ?? card.imageUrl}
                        alt=""
                        className="flash-game-cards__thumb"
                      />
                      <span className="flash-game-cards__thumb-label">Card {index + 1}</span>
                    </button>
                    <div className="flash-game-cards__item-actions">
                      <label className="btn btn--ghost btn--small">
                        Replace
                        <input
                          type="file"
                          accept={FLASH_GAME_IMAGE_ACCEPT}
                          className="visually-hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) replaceCardFile(index, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        onClick={() => removeCard(index)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {zoneImageUrl && selectedCard && (
                <FlashWordZoneEditor
                  imageUrl={zoneImageUrl}
                  zone={selectedCard.zone}
                  onChange={(zone) => updateCardZone(selectedCardIndex, zone)}
                  showDistractionZones={form.distractionZonesEnabled}
                  distractionZones={selectedCard.distractionZones}
                  onDistractionZonesChange={(distractionZones) =>
                    updateCardDistractionZones(selectedCardIndex, distractionZones)
                  }
                />
              )}
            </>
          )}
        </div>

        <div className="flash-game-rounds">
          <div className="flash-game-rounds__header">
            <h4 className="section-title">Word combinations</h4>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                disabled={libraryBusy}
                onClick={() => void saveAllTripletsToLibrary()}
              >
                Save all to library
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setLibraryOpen((open) => !open)}
              >
                {libraryOpen ? 'Hide library' : 'Import from library'}
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => addTriplet()}>
                Add combination
              </button>
            </div>
          </div>
          <p className="muted">
            Each row is three words shown as choices. On each play, a random card, a random
            combination, and one of its three words are picked for the flash. At least one
            combination is required to publish.
          </p>

          {!editingId && (
            <label className="flash-game-rounds__checkbox">
              <input
                type="checkbox"
                checked={saveToLibraryOnCreate}
                onChange={(e) => setSaveToLibraryOnCreate(e.target.checked)}
              />
              Save combinations to library when creating this game
            </label>
          )}

          {libraryOpen && (
            <div className="flash-game-saved-combos">
              <div className="flash-game-saved-combos__header">
                <h5 className="section-title">Saved combinations library</h5>
                <span className="admin-count" aria-live="polite">
                  {savedCombinations.length}
                </span>
              </div>
              {libraryLoading ? (
                <p className="muted">Loading library…</p>
              ) : savedCombinations.length === 0 ? (
                <p className="muted">No saved combinations yet. Save one from a row below.</p>
              ) : (
                <ul className="admin-library flash-game-saved-combos__list">
                  {savedCombinations.map((combination) => (
                    <li key={combination.id} className="admin-library-item">
                      <div className="admin-library-item__main">
                        <strong className="admin-library-item__title">
                          {formatCombinationLabel(combination)}
                        </strong>
                      </div>
                      <div className="btn-row admin-library-item__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          disabled={libraryBusy}
                          onClick={() => importFromLibrary(combination)}
                        >
                          Add to game
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--small"
                          disabled={libraryBusy}
                          onClick={() => void removeFromLibrary(combination)}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {form.triplets.map((triplet, index) => (
            <div key={index} className="flash-game-round-row">
              <label className="form-field">
                Word 1
                <input
                  type="text"
                  value={triplet.word1}
                  onChange={(e) => updateTriplet(index, { word1: e.target.value })}
                />
              </label>
              <label className="form-field">
                Word 2
                <input
                  type="text"
                  value={triplet.word2}
                  onChange={(e) => updateTriplet(index, { word2: e.target.value })}
                />
              </label>
              <label className="form-field">
                Word 3
                <input
                  type="text"
                  value={triplet.word3}
                  onChange={(e) => updateTriplet(index, { word3: e.target.value })}
                />
              </label>
              <div className="flash-game-round-row__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={libraryBusy}
                  onClick={() => void saveTripletToLibrary(index)}
                >
                  Save to library
                </button>
                {form.triplets.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--danger btn--small"
                    onClick={() => removeTriplet(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn--primary"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create game'}
        </button>
      </section>
    </>
  );
}
