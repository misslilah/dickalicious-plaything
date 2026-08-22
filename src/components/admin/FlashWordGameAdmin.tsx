import { useEffect, useMemo, useRef, useState } from 'react';
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
  FLASH_GAME_AUDIO_ACCEPT,
  MAX_FLASH_GAME_AUDIO_BYTES,
  saveCombinationToLibrary,
  saveCombinationsToLibrary,
  updateFlashWordGame,
  type CardFileEntry,
  type FlashWordCard,
  type FlashWordDistractionZoneInput,
  type FlashWordGame,
  type FlashWordGameInput,
  type FlashWordHardDistractionZoneInput,
  type FlashWordHardModeImageFormEntry,
  type FlashWordSavedCombination,
  type FlashWordStreakTier,
  type FlashWordTripletInput,
  type FlashWordZone,
  type HardModeImageFileEntry,
  type StreakTierAudioFileEntry,
} from '../../lib/flashWordGames';
import { FlashWordGameTestModal } from '../FlashWordGameTestModal';
import { FlashWordZoneEditor } from '../FlashWordZoneEditor';
import {
  buildSandboxFlashWordGame,
  buildStreakRewardPreviewGame,
  type AdminStreakTierSource,
} from '../../lib/flashWordAdminTest';
import {
  playFlashWordStreakAudio,
  stopFlashWordStreakAudio,
} from '../../lib/flashWordStreakReward';
import type { FlashWordStreakRewardPreview } from '../FlashWordGamePlayer';

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
  hardModeZones: FlashWordZone[];
  hardDistractionZones: FlashWordHardDistractionZoneInput[];
  hardModeImages: FlashWordHardModeImageFormEntry[];
  pendingFile?: File;
  pendingPreviewUrl?: string;
};

type StreakTierFormEntry = {
  id?: string;
  streakThreshold: number;
  xpReward: number;
  message: string;
  audioUrl?: string;
  pendingAudioFile?: File;
  clearAudio?: boolean;
};

function blankForm(): {
  title: string;
  description: string;
  flashDurationMs: number;
  distractionZonesEnabled: boolean;
  cards: CardFormEntry[];
  triplets: FlashWordTripletInput[];
  streakTiers: StreakTierFormEntry[];
} {
  return {
    title: '',
    description: '',
    flashDurationMs: DEFAULT_FLASH_DURATION_MS,
    distractionZonesEnabled: false,
    cards: [],
    triplets: [{ ...EMPTY_TRIPLET }],
    streakTiers: [],
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
    hardModeZones: card.hardModeZones.map((zone) => ({ ...zone })),
    hardDistractionZones: card.hardDistractionZones.map((zone) => ({
      id: zone.id,
      zone: { ...zone.zone },
      word: zone.word,
    })),
    hardModeImages: card.hardModeImages.map((image) => ({
      id: image.id,
      imagePath: image.imagePath,
      imageUrl: image.imageUrl,
      zone: { ...image.zone },
      displayMode: image.displayMode,
    })),
  };
}

function streakTierToFormEntry(tier: FlashWordStreakTier): StreakTierFormEntry {
  return {
    id: tier.id,
    streakThreshold: tier.streakThreshold,
    xpReward: tier.xpReward,
    message: tier.message ?? '',
    audioUrl: tier.audioUrl ?? undefined,
  };
}

function tierHasAudioClip(tier: StreakTierFormEntry): boolean {
  return Boolean((tier.pendingAudioFile || tier.audioUrl) && !tier.clearAudio);
}

function resolveTierAudioUrl(tier: StreakTierFormEntry): {
  url: string | null;
  objectUrl?: string;
} {
  if (!tierHasAudioClip(tier)) return { url: null };
  if (tier.pendingAudioFile) {
    const objectUrl = URL.createObjectURL(tier.pendingAudioFile);
    return { url: objectUrl, objectUrl };
  }
  return { url: tier.audioUrl ?? null };
}

function mapFormStreakTiersForSandbox(
  tiers: StreakTierFormEntry[],
): { sources: AdminStreakTierSource[]; revoke: () => void } {
  const objectUrls: string[] = [];
  const sources = tiers.map((tier) => {
    const resolved = resolveTierAudioUrl(tier);
    if (resolved.objectUrl) objectUrls.push(resolved.objectUrl);
    return {
      id: tier.id,
      streakThreshold: tier.streakThreshold,
      xpReward: tier.xpReward,
      message: tier.message,
      audioUrl: resolved.url,
    };
  });
  return {
    sources,
    revoke: () => {
      for (const url of objectUrls) URL.revokeObjectURL(url);
    },
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
    streakTiers: game.streakTiers.map(streakTierToFormEntry),
  };
}

function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5.14v13.72L19 12Z" />
    </svg>
  );
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

function AudioIcon() {
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
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function EyeIcon() {
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
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function formatCombinationLabel(combination: FlashWordSavedCombination): string {
  return `${combination.word1} · ${combination.word2} · ${combination.word3}`;
}

function formatTripletLabel(triplet: FlashWordTripletInput): string {
  const w1 = triplet.word1.trim();
  const w2 = triplet.word2.trim();
  const w3 = triplet.word3.trim();
  if (!w1 && !w2 && !w3) return 'New combination';
  return `${w1 || '…'} · ${w2 || '…'} · ${w3 || '…'}`;
}

function formatStreakTierLabel(tier: StreakTierFormEntry): string {
  const threshold = Number.isFinite(tier.streakThreshold) ? String(tier.streakThreshold) : '?';
  const xp = Number.isFinite(tier.xpReward) ? tier.xpReward : 0;
  const message = tier.message.trim().replace(/\s+/g, ' ');
  const snippet = message.length > 36 ? `${message.slice(0, 35).trimEnd()}…` : message;
  const parts = [`Streak ${threshold}`, `+${xp} XP`];
  if (snippet) parts.push(snippet);
  return parts.join(' · ');
}

function tripletIsIncomplete(triplet: FlashWordTripletInput): boolean {
  return !triplet.word1.trim() || !triplet.word2.trim() || !triplet.word3.trim();
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
  const [editingTripletIndex, setEditingTripletIndex] = useState<number | null>(null);
  const [editingStreakTierIndex, setEditingStreakTierIndex] = useState<number | null>(null);
  const [savedCombinations, setSavedCombinations] = useState<FlashWordSavedCombination[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [saveToLibraryOnCreate, setSaveToLibraryOnCreate] = useState(true);
  const [testPlay, setTestPlay] = useState<{
    game: FlashWordGame;
    cardLabel: string;
    previewReward?: FlashWordStreakRewardPreview;
    revokeAudioUrls?: () => void;
  } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const streakListenAudioRef = useRef<HTMLAudioElement | null>(null);
  const streakListenObjectUrlRef = useRef<string | null>(null);
  const testPlayRevokeRef = useRef<(() => void) | undefined>(undefined);

  const selectedCard = form.cards[selectedCardIndex] ?? null;
  const zoneImageUrl =
    selectedCard?.pendingPreviewUrl ?? selectedCard?.imageUrl ?? null;
  testPlayRevokeRef.current = testPlay?.revokeAudioUrls;

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

  useEffect(
    () => () => {
      stopFlashWordStreakAudio(streakListenAudioRef.current);
      streakListenAudioRef.current = null;
      if (streakListenObjectUrlRef.current) {
        URL.revokeObjectURL(streakListenObjectUrlRef.current);
        streakListenObjectUrlRef.current = null;
      }
      testPlayRevokeRef.current?.();
    },
    [],
  );

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
    setEditingTripletIndex(null);
    setEditingStreakTierIndex(null);
    setMessage('');
    setError('');
  };

  const startEdit = (game: FlashWordGame) => {
    setEditingId(game.id);
    setForm(gameToForm(game));
    setSelectedCardIndex(0);
    setEditingTripletIndex(null);
    setEditingStreakTierIndex(null);
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

  const startAddCombination = () => {
    const emptyIndex = form.triplets.findIndex(
      (triplet) =>
        !triplet.word1.trim() && !triplet.word2.trim() && !triplet.word3.trim(),
    );
    if (emptyIndex >= 0) {
      setEditingTripletIndex(emptyIndex);
      return;
    }
    setEditingTripletIndex(form.triplets.length);
    addTriplet();
  };

  const removeTriplet = (index: number) => {
    setForm((prev) => ({
      ...prev,
      triplets: prev.triplets.filter((_, i) => i !== index),
    }));
    setEditingTripletIndex((current) => {
      if (current == null) return null;
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
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

  const updateCardHardModeZones = (index: number, hardModeZones: FlashWordZone[]) => {
    setForm((prev) => ({
      ...prev,
      cards: prev.cards.map((card, i) =>
        i === index ? { ...card, hardModeZones } : card,
      ),
    }));
  };

  const updateCardHardDistractionZones = (
    index: number,
    hardDistractionZones: FlashWordHardDistractionZoneInput[],
  ) => {
    setForm((prev) => ({
      ...prev,
      cards: prev.cards.map((card, i) =>
        i === index ? { ...card, hardDistractionZones } : card,
      ),
    }));
  };

  const updateCardHardModeImages = (
    index: number,
    hardModeImages: FlashWordHardModeImageFormEntry[],
  ) => {
    setForm((prev) => ({
      ...prev,
      cards: prev.cards.map((card, i) =>
        i === index ? { ...card, hardModeImages } : card,
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
          hardModeZones: [],
          hardDistractionZones: [],
          hardModeImages: [],
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
      for (const image of card?.hardModeImages ?? []) {
        if (image.pendingPreviewUrl) URL.revokeObjectURL(image.pendingPreviewUrl);
      }
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

  const addStreakTier = () => {
    setForm((prev) => ({
      ...prev,
      streakTiers: [
        ...prev.streakTiers,
        { streakThreshold: 3, xpReward: 10, message: '' },
      ],
    }));
    setEditingStreakTierIndex(form.streakTiers.length);
  };

  const updateStreakTier = (index: number, patch: Partial<StreakTierFormEntry>) => {
    setForm((prev) => ({
      ...prev,
      streakTiers: prev.streakTiers.map((tier, i) =>
        i === index ? { ...tier, ...patch } : tier,
      ),
    }));
  };

  const removeStreakTier = (index: number) => {
    setForm((prev) => ({
      ...prev,
      streakTiers: prev.streakTiers.filter((_, i) => i !== index),
    }));
    setEditingStreakTierIndex((current) => {
      if (current == null) return null;
      if (current === index) return null;
      if (current > index) return current - 1;
      return current;
    });
  };

  const setStreakTierAudio = (index: number, file: File) => {
    if (!file.type.startsWith('audio/')) {
      setError('Only audio files are allowed for streak clips.');
      return;
    }
    if (file.size > MAX_FLASH_GAME_AUDIO_BYTES) {
      setError(
        `Audio too large. Max ${MAX_FLASH_GAME_AUDIO_BYTES / (1024 * 1024)} MB.`,
      );
      return;
    }
    setForm((prev) => ({
      ...prev,
      streakTiers: prev.streakTiers.map((tier, i) =>
        i === index
          ? { ...tier, pendingAudioFile: file, clearAudio: false }
          : tier,
      ),
    }));
    setError('');
  };

  const clearStreakTierAudio = (index: number) => {
    setForm((prev) => ({
      ...prev,
      streakTiers: prev.streakTiers.map((tier, i) =>
        i === index
          ? { ...tier, pendingAudioFile: undefined, clearAudio: true, audioUrl: undefined }
          : tier,
      ),
    }));
  };

  const stopStreakListenAudio = () => {
    stopFlashWordStreakAudio(streakListenAudioRef.current);
    streakListenAudioRef.current = null;
    if (streakListenObjectUrlRef.current) {
      URL.revokeObjectURL(streakListenObjectUrlRef.current);
      streakListenObjectUrlRef.current = null;
    }
  };

  const playStreakTierAudio = (index: number) => {
    const tier = form.streakTiers[index];
    if (!tier || !tierHasAudioClip(tier)) return;
    stopStreakListenAudio();
    const resolved = resolveTierAudioUrl(tier);
    if (!resolved.url) return;
    if (resolved.objectUrl) {
      streakListenObjectUrlRef.current = resolved.objectUrl;
    }
    const audio = playFlashWordStreakAudio(resolved.url);
    streakListenAudioRef.current = audio;
    audio.addEventListener('ended', () => {
      if (streakListenAudioRef.current === audio) {
        stopStreakListenAudio();
      }
    });
  };

  const closeTestPlay = () => {
    stopStreakListenAudio();
    setTestPlay((current) => {
      current?.revokeAudioUrls?.();
      return null;
    });
  };

  const openStreakRewardPreview = (index: number) => {
    const tier = form.streakTiers[index];
    if (!tier) return;

    stopStreakListenAudio();
    const mapped = mapFormStreakTiersForSandbox(form.streakTiers);
    const card = form.cards[selectedCardIndex] ?? form.cards[0] ?? null;
    const previewSource = mapped.sources[index];
    const game = buildStreakRewardPreviewGame({
      title: form.title,
      flashDurationMs: form.flashDurationMs,
      distractionZonesEnabled: form.distractionZonesEnabled,
      card,
      streakTiers: mapped.sources,
    });

    setError('');
    setTestPlay((current) => {
      current?.revokeAudioUrls?.();
      return {
        game,
        cardLabel: `Streak ${tier.streakThreshold}`,
        previewReward: {
          streakThreshold: tier.streakThreshold,
          xpReward: tier.xpReward,
          message: tier.message,
          audioUrl: previewSource?.audioUrl ?? null,
        },
        revokeAudioUrls: mapped.revoke,
      };
    });
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
      hardModeZones: card.hardModeZones,
      hardDistractionZones: card.hardDistractionZones,
      hardModeImages: card.hardModeImages.map((image) => ({
        id: image.id,
        imagePath: image.imagePath,
        zone: image.zone,
        displayMode: image.displayMode,
      })),
    })),
    triplets: form.triplets,
    streakTiers: form.streakTiers.map((tier) => ({
      id: tier.id,
      streakThreshold: tier.streakThreshold,
      xpReward: tier.xpReward,
      message: tier.message.trim() || null,
      clearAudio: tier.clearAudio,
    })),
  });

  const buildCardFiles = (): CardFileEntry[] =>
    form.cards
      .map((card, index) =>
        card.pendingFile ? { cardIndex: index, file: card.pendingFile } : null,
      )
      .filter((entry): entry is CardFileEntry => entry != null);

  const buildHardModeImageFiles = (): HardModeImageFileEntry[] =>
    form.cards.flatMap((card, cardIndex) =>
      card.hardModeImages.flatMap((image, imageIndex) =>
        image.pendingFile
          ? [{ cardIndex, imageIndex, file: image.pendingFile }]
          : [],
      ),
    );

  const buildStreakAudioFiles = (): StreakTierAudioFileEntry[] =>
    form.streakTiers
      .map((tier, index) =>
        tier.pendingAudioFile ? { tierIndex: index, file: tier.pendingAudioFile } : null,
      )
      .filter((entry): entry is StreakTierAudioFileEntry => entry != null);

  const save = async () => {
    setError('');
    setMessage('');

    if (form.cards.length === 0) {
      setError('Add at least one flash card image.');
      return;
    }

    const newCardsWithoutFile = form.cards.some(
      (card) => !card.id && !card.pendingFile,
    );
    if (newCardsWithoutFile) {
      setError('Each new flash card needs an image upload.');
      return;
    }

    setSaving(true);
    const missingHardModeImage = form.cards.some((card) =>
      card.hardModeImages.some((image) => !image.pendingFile && !image.imagePath),
    );
    if (missingHardModeImage) {
      setError('Each hard mode overlay image needs an image upload.');
      return;
    }

    const input = buildInput();
    const cardFiles = buildCardFiles();
    const hardModeImageFiles = buildHardModeImageFiles();
    const streakAudioFiles = buildStreakAudioFiles();
    const wasEditing = editingId != null;
    const result = editingId
      ? await updateFlashWordGame(
          editingId,
          input,
          cardFiles,
          streakAudioFiles,
          hardModeImageFiles,
        )
      : await createFlashWordGame(
          input,
          cardFiles,
          streakAudioFiles,
          hardModeImageFiles,
        );
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
    setEditingTripletIndex(null);
    setEditingStreakTierIndex(null);
  };

  const selectCardForEdit = (index: number) => {
    setSelectedCardIndex(index);
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const openTestPlay = (cardIndex: number) => {
    const card = form.cards[cardIndex];
    if (!card) return;

    const mapped = mapFormStreakTiersForSandbox(form.streakTiers);
    const result = buildSandboxFlashWordGame({
      title: form.title,
      flashDurationMs: form.flashDurationMs,
      distractionZonesEnabled: form.distractionZonesEnabled,
      card,
      triplets: form.triplets,
      streakTiers: mapped.sources,
    });

    if (!result.ok) {
      mapped.revoke();
      setError(result.error);
      return;
    }

    stopStreakListenAudio();
    setError('');
    setTestPlay((current) => {
      current?.revokeAudioUrls?.();
      return {
        game: result.game,
        cardLabel: `Card ${cardIndex + 1}`,
        revokeAudioUrls: mapped.revoke,
      };
    });
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
              <ul className="flash-game-cards__grid">
                {form.cards.map((card, index) => {
                  const selected = index === selectedCardIndex;
                  const label = `Card ${index + 1}`;
                  return (
                    <li
                      key={card.id ?? `new-${index}`}
                      className={
                        selected
                          ? 'flash-game-cards__cell flash-game-cards__cell--selected'
                          : 'flash-game-cards__cell'
                      }
                    >
                      <button
                        type="button"
                        className="flash-game-cards__cell-preview"
                        onClick={() => selectCardForEdit(index)}
                        aria-pressed={selected}
                        aria-label={`Edit ${label}`}
                        title={label}
                      >
                        <img
                          src={card.pendingPreviewUrl ?? card.imageUrl}
                          alt=""
                          className="flash-game-cards__cell-thumb"
                        />
                      </button>
                      <div className="flash-game-cards__cell-actions">
                        <button
                          type="button"
                          className="flash-game-cards__cell-action"
                          onClick={() => {
                            setSelectedCardIndex(index);
                            openTestPlay(index);
                          }}
                          aria-label={`Test play ${label}`}
                          title="Test play"
                        >
                          <PlayIcon />
                          <span>Test</span>
                        </button>
                        <button
                          type="button"
                          className="flash-game-cards__cell-action"
                          onClick={() => selectCardForEdit(index)}
                          aria-label={`Edit ${label}`}
                          title="Edit"
                        >
                          <PencilIcon />
                          <span>Edit</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="flash-game-cards__cell-remove"
                        onClick={() => removeCard(index)}
                        aria-label={`Remove ${label}`}
                        title="Remove"
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selectedCard && (
                <div ref={editorRef} className="flash-game-cards__selected">
                  <div className="flash-game-cards__selected-bar">
                    <strong>Editing card {selectedCardIndex + 1}</strong>
                    <div className="btn-row">
                      <label className="btn btn--ghost btn--small">
                        Replace
                        <input
                          type="file"
                          accept={FLASH_GAME_IMAGE_ACCEPT}
                          className="visually-hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) replaceCardFile(selectedCardIndex, file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => openTestPlay(selectedCardIndex)}
                      >
                        Test play
                      </button>
                    </div>
                  </div>

                  {zoneImageUrl && (
                    <FlashWordZoneEditor
                      imageUrl={zoneImageUrl}
                      zone={selectedCard.zone}
                      onChange={(zone) => updateCardZone(selectedCardIndex, zone)}
                      showDistractionZones={form.distractionZonesEnabled}
                      distractionZones={selectedCard.distractionZones}
                      onDistractionZonesChange={(distractionZones) =>
                        updateCardDistractionZones(selectedCardIndex, distractionZones)
                      }
                      hardModeHighlightZones={selectedCard.hardModeZones}
                      onHardModeHighlightZonesChange={(hardModeZones) =>
                        updateCardHardModeZones(selectedCardIndex, hardModeZones)
                      }
                      hardDistractionZones={selectedCard.hardDistractionZones}
                      onHardDistractionZonesChange={(hardDistractionZones) =>
                        updateCardHardDistractionZones(selectedCardIndex, hardDistractionZones)
                      }
                      hardModeImages={selectedCard.hardModeImages}
                      onHardModeImagesChange={(hardModeImages) =>
                        updateCardHardModeImages(selectedCardIndex, hardModeImages)
                      }
                    />
                  )}

                  <p className="muted flash-game-test-play__hint">
                    Test play opens this card in sandbox mode with hard mode forced on. Uses
                    unsaved zone edits and your word combinations — streak, leaderboard, and
                    daily limits are not affected.
                  </p>
                </div>
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
              <button type="button" className="btn btn--ghost btn--small" onClick={startAddCombination}>
                Add combination
              </button>
            </div>
          </div>
          <p className="muted">
            Each combination is three words shown as choices. On each play, a random card, a random
            combination, and one of its three words are picked for the flash. At least one complete
            combination is required to publish and to test play.
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
                <p className="muted">No saved combinations yet. Edit a combination and save it to the library.</p>
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

          <ul className="flash-game-combos">
            {form.triplets.map((triplet, index) => {
              const editing = editingTripletIndex === index;
              const incomplete = tripletIsIncomplete(triplet);
              const label = formatTripletLabel(triplet);
              return (
                <li
                  key={triplet.id ?? `new-combo-${index}`}
                  className={
                    editing
                      ? 'flash-game-combo flash-game-combo--editing'
                      : 'flash-game-combo'
                  }
                >
                  {editing ? (
                    <>
                      <div className="flash-game-combo__fields">
                        <label className="form-field">
                          Word 1
                          <input
                            type="text"
                            value={triplet.word1}
                            onChange={(e) => updateTriplet(index, { word1: e.target.value })}
                            autoFocus
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
                      </div>
                      <div className="flash-game-combo__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => setEditingTripletIndex(null)}
                        >
                          Done
                        </button>
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
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="flash-game-combo__summary"
                        onClick={() => setEditingTripletIndex(index)}
                        aria-label={`Edit ${label}`}
                      >
                        <span
                          className={
                            incomplete
                              ? 'flash-game-combo__label flash-game-combo__label--incomplete'
                              : 'flash-game-combo__label'
                          }
                        >
                          {label}
                        </span>
                      </button>
                      <div className="flash-game-combo__actions">
                        <button
                          type="button"
                          className="flash-game-combo__action"
                          onClick={() => setEditingTripletIndex(index)}
                          aria-label={`Edit ${label}`}
                          title="Edit"
                        >
                          <PencilIcon />
                          <span>Edit</span>
                        </button>
                        {form.triplets.length > 1 && (
                          <button
                            type="button"
                            className="flash-game-combo__action flash-game-combo__action--danger"
                            onClick={() => removeTriplet(index)}
                            aria-label={`Delete ${label}`}
                            title="Delete"
                          >
                            <TrashIcon />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flash-game-streak-rewards">
          <div className="flash-game-streak-rewards__header">
            <h4 className="section-title">Streak rewards</h4>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={addStreakTier}
            >
              Add streak reward
            </button>
          </div>
          <p className="muted">
            When a player reaches each streak count in one session, they earn XP and optional
            message and audio shown beside the flash image (not on top of it). Each threshold
            can only trigger once per session. Use Play audio to hear a clip, or Preview to
            see the live in-game overlay without changing your real streak.
          </p>

          {form.streakTiers.length === 0 ? (
            <p className="muted">No streak tiers — add one to reward consecutive correct answers.</p>
          ) : (
            <ul className="flash-game-streak-rewards__list">
              {form.streakTiers.map((tier, index) => {
                const editing = editingStreakTierIndex === index;
                const hasAudio = tierHasAudioClip(tier);
                const label = formatStreakTierLabel(tier);
                return (
                  <li
                    key={tier.id ?? `new-tier-${index}`}
                    className={
                      editing
                        ? 'flash-game-streak-tier-row flash-game-streak-tier-row--editing'
                        : 'flash-game-streak-tier-row'
                    }
                  >
                    {editing ? (
                      <>
                        <div className="flash-game-streak-tier-row__fields">
                          <label className="form-field">
                            Streak count
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={tier.streakThreshold}
                              autoFocus
                              onChange={(e) =>
                                updateStreakTier(index, {
                                  streakThreshold: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="form-field">
                            XP reward
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={tier.xpReward}
                              onChange={(e) =>
                                updateStreakTier(index, { xpReward: Number(e.target.value) })
                              }
                            />
                          </label>
                          <label className="form-field flash-game-streak-tier-row__message">
                            Message <span className="muted">(optional)</span>
                            <input
                              type="text"
                              value={tier.message}
                              placeholder="Shown beside the image at this streak"
                              onChange={(e) =>
                                updateStreakTier(index, { message: e.target.value })
                              }
                            />
                          </label>
                          <div className="flash-game-streak-tier-row__audio">
                            <span className="form-field__label">Audio clip</span>
                            {(tier.pendingAudioFile || tier.audioUrl) && !tier.clearAudio ? (
                              <p className="muted flash-game-streak-tier-row__audio-name">
                                {tier.pendingAudioFile?.name ?? 'Saved clip'}
                              </p>
                            ) : (
                              <p className="muted">No audio</p>
                            )}
                            <div className="btn-row">
                              <label className="btn btn--ghost btn--small">
                                Upload
                                <input
                                  type="file"
                                  accept={FLASH_GAME_AUDIO_ACCEPT}
                                  className="visually-hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) setStreakTierAudio(index, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {hasAudio && (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--small"
                                  onClick={() => playStreakTierAudio(index)}
                                >
                                  Play audio
                                </button>
                              )}
                              {hasAudio && (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--small"
                                  onClick={() => clearStreakTierAudio(index)}
                                >
                                  Remove audio
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flash-game-streak-tier-row__actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => setEditingStreakTierIndex(null)}
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => openStreakRewardPreview(index)}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--small"
                            onClick={() => removeStreakTier(index)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="flash-game-streak-tier-row__summary"
                          onClick={() => setEditingStreakTierIndex(index)}
                          aria-label={`Edit ${label}${hasAudio ? ', with audio' : ''}`}
                        >
                          <span className="flash-game-streak-tier-row__label">{label}</span>
                          {hasAudio && (
                            <span
                              className="flash-game-streak-tier-row__audio-mark"
                              title="Has audio"
                            >
                              <AudioIcon />
                            </span>
                          )}
                        </button>
                        <div className="flash-game-streak-tier-row__actions">
                          {hasAudio && (
                            <button
                              type="button"
                              className="flash-game-streak-tier-row__action"
                              onClick={() => playStreakTierAudio(index)}
                              aria-label="Play audio"
                              title="Play audio"
                            >
                              <PlayIcon />
                              <span>Play audio</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="flash-game-streak-tier-row__action"
                            onClick={() => openStreakRewardPreview(index)}
                            aria-label="Preview"
                            title="Preview"
                          >
                            <EyeIcon />
                            <span>Preview</span>
                          </button>
                          <button
                            type="button"
                            className="flash-game-streak-tier-row__action"
                            onClick={() => setEditingStreakTierIndex(index)}
                            aria-label="Edit"
                            title="Edit"
                          >
                            <PencilIcon />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="flash-game-streak-tier-row__action flash-game-streak-tier-row__action--danger"
                            onClick={() => removeStreakTier(index)}
                            aria-label="Delete"
                            title="Delete"
                          >
                            <TrashIcon />
                            <span>Delete</span>
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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

      {testPlay && (
        <FlashWordGameTestModal
          game={testPlay.game}
          cardLabel={testPlay.cardLabel}
          previewReward={testPlay.previewReward}
          onClose={closeTestPlay}
        />
      )}
    </>
  );
}
