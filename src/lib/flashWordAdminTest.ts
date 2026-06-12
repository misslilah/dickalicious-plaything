import {
  type FlashWordCard,
  type FlashWordDistractionZoneInput,
  type FlashWordGame,
  type FlashWordHardDistractionZoneInput,
  type FlashWordHardModeImageFormEntry,
  type FlashWordTripletInput,
  type FlashWordZone,
  validateTripletInput,
} from './flashWordGames';

export type AdminTestCardSource = {
  id?: string;
  imageUrl?: string;
  pendingPreviewUrl?: string;
  zone: FlashWordZone;
  distractionZones: FlashWordDistractionZoneInput[];
  hardModeZones: FlashWordZone[];
  hardDistractionZones: FlashWordHardDistractionZoneInput[];
  hardModeImages: FlashWordHardModeImageFormEntry[];
};

export type BuildSandboxGameInput = {
  title: string;
  flashDurationMs: number;
  distractionZonesEnabled: boolean;
  card: AdminTestCardSource;
  triplets: FlashWordTripletInput[];
};

function formCardToSandboxCard(card: AdminTestCardSource): FlashWordCard {
  const cardId = card.id ?? 'sandbox-card';
  const imageUrl = card.pendingPreviewUrl ?? card.imageUrl ?? '';

  return {
    id: cardId,
    gameId: 'sandbox',
    imagePath: '',
    imageUrl,
    zone: card.zone,
    distractionZones: card.distractionZones.map((zone, index) => ({
      id: zone.id ?? `sandbox-dz-${index}`,
      cardId,
      zone: zone.zone,
      word: zone.word,
      sortOrder: index,
    })),
    hardModeZones: card.hardModeZones.map((zone) => ({ ...zone })),
    hardDistractionZones: card.hardDistractionZones.map((zone, index) => ({
      id: zone.id ?? `sandbox-hdz-${index}`,
      zone: zone.zone,
      word: zone.word,
    })),
    hardModeImages: card.hardModeImages.map((image, index) => ({
      id: image.id ?? `sandbox-hmi-${index}`,
      imagePath: image.imagePath ?? '',
      imageUrl: image.pendingPreviewUrl ?? image.imageUrl ?? '',
      zone: image.zone,
      displayMode: image.displayMode ?? 'persistent',
    })),
    sortOrder: 0,
  };
}

export function buildSandboxFlashWordGame(
  input: BuildSandboxGameInput,
): { ok: true; game: FlashWordGame } | { ok: false; error: string } {
  const imageUrl = input.card.pendingPreviewUrl ?? input.card.imageUrl ?? '';
  if (!imageUrl.trim()) {
    return { ok: false, error: 'This card needs an image before you can test play.' };
  }

  const validTriplets = input.triplets.filter(
    (triplet) => validateTripletInput(triplet) == null,
  );
  if (validTriplets.length === 0) {
    return {
      ok: false,
      error: 'Add at least one complete word combination (three words) to test play.',
    };
  }

  const sandboxCard = formCardToSandboxCard(input.card);

  return {
    ok: true,
    game: {
      id: 'sandbox',
      title: input.title.trim() || 'Test play',
      description: null,
      flashDurationMs: input.flashDurationMs,
      distractionZonesEnabled: input.distractionZonesEnabled,
      createdAt: new Date().toISOString(),
      cards: [sandboxCard],
      triplets: validTriplets.map((triplet, index) => ({
        id: triplet.id ?? `sandbox-triplet-${index}`,
        gameId: 'sandbox',
        word1: triplet.word1.trim(),
        word2: triplet.word2.trim(),
        word3: triplet.word3.trim(),
        sortOrder: index,
      })),
      streakTiers: [],
    },
  };
}
