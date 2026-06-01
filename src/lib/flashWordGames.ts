import { getSupabase } from './supabase';

export const FLASH_GAME_BUCKET = 'flash-game-images';

export const DEFAULT_FLASH_DURATION_MS = 200;
export const MIN_FLASH_DURATION_MS = 50;
export const MAX_FLASH_DURATION_MS = 2000;

export const DEFAULT_ZONE = {
  xPct: 40,
  yPct: 45,
  widthPct: 20,
  heightPct: 10,
};

export const DEFAULT_DISTRACTION_ZONE = {
  xPct: 10,
  yPct: 70,
  widthPct: 15,
  heightPct: 8,
};

export const MAX_FLASH_GAME_IMAGE_BYTES = 5 * 1024 * 1024;

export const FLASH_GAME_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

const MIGRATION_HINT =
  'Flash Cards games are not set up yet. In Supabase SQL Editor, run supabase/migrations/028_flash_word_games.sql through 032_flash_card_distraction_zones.sql, then retry.';

const BUCKET_HINT =
  'The flash-game-images storage bucket is not set up yet. In Supabase SQL Editor, run supabase/migrations/028_flash_word_games.sql, then retry the upload.';

export interface FlashWordZone {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface FlashWordDistractionZone {
  id: string;
  cardId: string;
  zone: FlashWordZone;
  word: string;
  sortOrder: number;
}

export interface FlashWordCard {
  id: string;
  gameId: string;
  imagePath: string;
  imageUrl: string;
  zone: FlashWordZone;
  distractionZones: FlashWordDistractionZone[];
  sortOrder: number;
}

export interface FlashWordGameTriplet {
  id: string;
  gameId: string;
  word1: string;
  word2: string;
  word3: string;
  sortOrder: number;
}

export interface FlashWordGame {
  id: string;
  title: string;
  description: string | null;
  flashDurationMs: number;
  distractionZonesEnabled: boolean;
  createdAt: string;
  cards: FlashWordCard[];
  triplets: FlashWordGameTriplet[];
}

export interface FlashWordGameSummary {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
  cardCount: number;
  tripletCount: number;
  flashDurationMs: number;
  createdAt: string;
}

export interface FlashWordDistractionZoneInput {
  id?: string;
  zone: FlashWordZone;
  word: string;
}

export interface FlashWordCardInput {
  id?: string;
  zone: FlashWordZone;
  distractionZones?: FlashWordDistractionZoneInput[];
}

export interface FlashWordTripletInput {
  id?: string;
  word1: string;
  word2: string;
  word3: string;
}

export interface FlashWordGameInput {
  title: string;
  description: string | null;
  flashDurationMs: number;
  distractionZonesEnabled: boolean;
  cards: FlashWordCardInput[];
  triplets: FlashWordTripletInput[];
}

export interface FlashWordSavedCombination {
  id: string;
  word1: string;
  word2: string;
  word3: string;
  createdAt: string;
  createdBy: string | null;
}

type DbFlashWordGame = {
  id: string;
  title: string;
  description: string | null;
  flash_duration_ms: number;
  distraction_zones_enabled: boolean;
  created_at: string;
};

type DbFlashWordCard = {
  id: string;
  game_id: string;
  image_path: string;
  zone_x_pct: number;
  zone_y_pct: number;
  zone_width_pct: number;
  zone_height_pct: number;
  sort_order: number;
};

type DbFlashWordDistractionZone = {
  id: string;
  card_id: string;
  zone_x_pct: number;
  zone_y_pct: number;
  zone_width_pct: number;
  zone_height_pct: number;
  word: string;
  sort_order: number;
};

type DbFlashWordGameTriplet = {
  id: string;
  game_id: string;
  word_1: string;
  word_2: string;
  word_3: string;
  sort_order: number;
};

type DbFlashWordSavedCombination = {
  id: string;
  word_1: string;
  word_2: string;
  word_3: string;
  created_at: string;
  created_by: string | null;
};

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.flash_word_games'") ||
    message.includes("Could not find the table 'public.flash_word_game_rounds'") ||
    message.includes("Could not find the table 'public.flash_word_cards'") ||
    message.includes("Could not find the table 'public.flash_word_saved_combinations'") ||
    message.includes("Could not find the table 'public.flash_word_card_distraction_zones'")
  ) {
    return MIGRATION_HINT;
  }
  if (
    message.includes('distraction_zones_enabled') ||
    (message.includes('column') && message.includes('flash_word_games'))
  ) {
    return `${message} Run supabase/migrations/032_flash_card_distraction_zones.sql in Supabase SQL Editor, then retry.`;
  }
  if (
    message.includes('correct_word') ||
    message.includes('distractor_1') ||
    (message.includes('column') && message.includes('flash_word_game_rounds'))
  ) {
    return `${message} Run supabase/migrations/029_flash_word_triplets.sql in Supabase SQL Editor, then retry.`;
  }
  return message;
}

function formatUploadError(error: { message?: string }): string {
  const message = error.message ?? 'Upload failed.';
  if (/bucket not found/i.test(message)) return BUCKET_HINT;
  return message;
}

function clampPct(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeZone(zone: FlashWordZone): FlashWordZone {
  const widthPct = clampPct(zone.widthPct, 5, 100);
  const heightPct = clampPct(zone.heightPct, 3, 100);
  return {
    xPct: clampPct(zone.xPct, 0, 100 - widthPct),
    yPct: clampPct(zone.yPct, 0, 100 - heightPct),
    widthPct,
    heightPct,
  };
}

export function validateFlashDurationMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return 'Enter a valid flash duration.';
  if (ms < MIN_FLASH_DURATION_MS || ms > MAX_FLASH_DURATION_MS) {
    return `Flash duration must be between ${MIN_FLASH_DURATION_MS} and ${MAX_FLASH_DURATION_MS} ms.`;
  }
  return null;
}

export function tripletWords(triplet: FlashWordGameTriplet): [string, string, string] {
  return [triplet.word1, triplet.word2, triplet.word3];
}

export function validateTripletInput(triplet: FlashWordTripletInput): string | null {
  const w1 = triplet.word1.trim();
  const w2 = triplet.word2.trim();
  const w3 = triplet.word3.trim();
  if (!w1 || !w2 || !w3) return 'Each combination needs three non-empty words.';
  if (w1 === w2 || w1 === w3 || w2 === w3) {
    return 'All three words in a combination must be different.';
  }
  return null;
}

export function validateGameInput(input: FlashWordGameInput): string | null {
  const title = input.title.trim();
  if (!title) return 'Title is required.';
  const durationError = validateFlashDurationMs(input.flashDurationMs);
  if (durationError) return durationError;
  if (input.cards.length === 0) return 'Add at least one flash card image.';
  if (input.triplets.length === 0) return 'Add at least one word combination.';
  for (const triplet of input.triplets) {
    const tripletError = validateTripletInput(triplet);
    if (tripletError) return tripletError;
  }
  return null;
}

export function flashGameStoragePath(gameId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${gameId}/${safe}`;
}

export function flashCardStoragePath(
  gameId: string,
  cardId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${gameId}/cards/${cardId}/${safe}`;
}

export function getFlashGameImageUrl(storagePath: string): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = supabase.storage.from(FLASH_GAME_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl ?? null;
}

function mapZoneFromRow(row: {
  zone_x_pct: number;
  zone_y_pct: number;
  zone_width_pct: number;
  zone_height_pct: number;
}): FlashWordZone {
  return normalizeZone({
    xPct: Number(row.zone_x_pct),
    yPct: Number(row.zone_y_pct),
    widthPct: Number(row.zone_width_pct),
    heightPct: Number(row.zone_height_pct),
  });
}

function mapDistractionZone(row: DbFlashWordDistractionZone): FlashWordDistractionZone {
  return {
    id: row.id,
    cardId: row.card_id,
    zone: mapZoneFromRow(row),
    word: row.word,
    sortOrder: row.sort_order,
  };
}

function mapCard(
  row: DbFlashWordCard,
  distractionZones: FlashWordDistractionZone[] = [],
): FlashWordCard | null {
  const imageUrl = getFlashGameImageUrl(row.image_path);
  if (!imageUrl) return null;
  return {
    id: row.id,
    gameId: row.game_id,
    imagePath: row.image_path,
    imageUrl,
    zone: mapZoneFromRow(row),
    distractionZones,
    sortOrder: row.sort_order,
  };
}

function mapTriplet(row: DbFlashWordGameTriplet): FlashWordGameTriplet {
  return {
    id: row.id,
    gameId: row.game_id,
    word1: row.word_1,
    word2: row.word_2,
    word3: row.word_3,
    sortOrder: row.sort_order,
  };
}

function mapGame(
  row: DbFlashWordGame,
  cards: FlashWordCard[],
  triplets: FlashWordGameTriplet[],
): FlashWordGame | null {
  if (cards.length === 0) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    flashDurationMs: row.flash_duration_ms,
    distractionZonesEnabled: row.distraction_zones_enabled ?? false,
    createdAt: row.created_at,
    cards,
    triplets,
  };
}

async function fetchDistractionZonesByCardIds(
  cardIds: string[],
): Promise<
  | { ok: true; zonesByCardId: Map<string, FlashWordDistractionZone[]> }
  | { ok: false; error: string }
> {
  if (cardIds.length === 0) {
    return { ok: true, zonesByCardId: new Map() };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('flash_word_card_distraction_zones')
    .select('*')
    .in('card_id', cardIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: formatDbError(error) };

  const zonesByCardId = new Map<string, FlashWordDistractionZone[]>();
  for (const row of data as DbFlashWordDistractionZone[]) {
    const mapped = mapDistractionZone(row);
    const list = zonesByCardId.get(mapped.cardId) ?? [];
    list.push(mapped);
    zonesByCardId.set(mapped.cardId, list);
  }

  return { ok: true, zonesByCardId };
}

async function replaceCardDistractionZones(
  cardId: string,
  zones: FlashWordDistractionZoneInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error: deleteError } = await supabase
    .from('flash_word_card_distraction_zones')
    .delete()
    .eq('card_id', cardId);

  if (deleteError) return { ok: false, error: formatDbError(deleteError) };

  if (zones.length === 0) return { ok: true };

  const { error: insertError } = await supabase.from('flash_word_card_distraction_zones').insert(
    zones.map((zone, index) => {
      const normalized = normalizeZone(zone.zone);
      return {
        id: zone.id ?? crypto.randomUUID(),
        card_id: cardId,
        zone_x_pct: normalized.xPct,
        zone_y_pct: normalized.yPct,
        zone_width_pct: normalized.widthPct,
        zone_height_pct: normalized.heightPct,
        word: zone.word.trim(),
        sort_order: index,
      };
    }),
  );

  if (insertError) return { ok: false, error: formatDbError(insertError) };
  return { ok: true };
}

export function shuffleChoices(words: [string, string, string]): string[] {
  const copy = [...words];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickRandomTriplet(
  triplets: FlashWordGameTriplet[],
): FlashWordGameTriplet | null {
  if (triplets.length === 0) return null;
  return triplets[Math.floor(Math.random() * triplets.length)] ?? null;
}

export function pickRandomCard(cards: FlashWordCard[]): FlashWordCard | null {
  if (cards.length === 0) return null;
  return cards[Math.floor(Math.random() * cards.length)] ?? null;
}

export function pickRandomFlashIndex(): 0 | 1 | 2 {
  return Math.floor(Math.random() * 3) as 0 | 1 | 2;
}

export function getFlashedWord(
  triplet: FlashWordGameTriplet,
  flashIndex: 0 | 1 | 2,
): string {
  const words = tripletWords(triplet);
  return words[flashIndex];
}

export async function fetchFlashWordGameSummaries(): Promise<
  { ok: true; games: FlashWordGameSummary[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('flash_word_games')
    .select('*, flash_word_game_rounds(count), flash_word_cards(id, image_path, sort_order)')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatDbError(error) };

  const games = (
    data as (DbFlashWordGame & {
      flash_word_game_rounds: { count: number }[];
      flash_word_cards: { id: string; image_path: string; sort_order: number }[];
    })[]
  )
    .map((row) => {
      const cards = [...(row.flash_word_cards ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      const firstCard = cards[0];
      if (!firstCard) return null;
      const imageUrl = getFlashGameImageUrl(firstCard.image_path);
      if (!imageUrl) return null;
      const tripletCount = row.flash_word_game_rounds?.[0]?.count ?? 0;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        imageUrl,
        cardCount: cards.length,
        tripletCount,
        flashDurationMs: row.flash_duration_ms,
        createdAt: row.created_at,
      } satisfies FlashWordGameSummary;
    })
    .filter(
      (game): game is FlashWordGameSummary =>
        game != null && game.cardCount > 0 && game.tripletCount > 0,
    );

  return { ok: true, games };
}

async function fetchCardsForGame(gameId: string): Promise<
  { ok: true; cards: FlashWordCard[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('flash_word_cards')
    .select('*')
    .eq('game_id', gameId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: formatDbError(error) };

  const rows = data as DbFlashWordCard[];
  const zonesRes = await fetchDistractionZonesByCardIds(rows.map((row) => row.id));
  if (!zonesRes.ok) return zonesRes;

  const cards = rows
    .map((row) => mapCard(row, zonesRes.zonesByCardId.get(row.id) ?? []))
    .filter((card): card is FlashWordCard => card != null);

  return { ok: true, cards };
}

export async function fetchFlashWordGame(
  gameId: string,
): Promise<{ ok: true; game: FlashWordGame } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const [gameRes, tripletsRes, cardsRes] = await Promise.all([
    supabase.from('flash_word_games').select('*').eq('id', gameId).maybeSingle(),
    supabase
      .from('flash_word_game_rounds')
      .select('*')
      .eq('game_id', gameId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    fetchCardsForGame(gameId),
  ]);

  if (gameRes.error) return { ok: false, error: formatDbError(gameRes.error) };
  if (tripletsRes.error) return { ok: false, error: formatDbError(tripletsRes.error) };
  if (!cardsRes.ok) return cardsRes;
  if (!gameRes.data) return { ok: false, error: 'Game not found.' };

  const triplets = (tripletsRes.data as DbFlashWordGameTriplet[]).map(mapTriplet);
  const game = mapGame(gameRes.data as DbFlashWordGame, cardsRes.cards, triplets);
  if (!game) return { ok: false, error: 'Game has no flash cards configured yet.' };
  return { ok: true, game };
}

export async function fetchAllFlashWordGames(): Promise<
  { ok: true; games: FlashWordGame[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const [gamesRes, tripletsRes, cardsRes] = await Promise.all([
    supabase.from('flash_word_games').select('*').order('created_at', { ascending: false }),
    supabase
      .from('flash_word_game_rounds')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('flash_word_cards')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (gamesRes.error) return { ok: false, error: formatDbError(gamesRes.error) };
  if (tripletsRes.error) return { ok: false, error: formatDbError(tripletsRes.error) };
  if (cardsRes.error) return { ok: false, error: formatDbError(cardsRes.error) };

  const tripletsByGame = new Map<string, FlashWordGameTriplet[]>();
  for (const row of tripletsRes.data as DbFlashWordGameTriplet[]) {
    const mapped = mapTriplet(row);
    const list = tripletsByGame.get(mapped.gameId) ?? [];
    list.push(mapped);
    tripletsByGame.set(mapped.gameId, list);
  }

  const cardRows = cardsRes.data as DbFlashWordCard[];
  const zonesRes = await fetchDistractionZonesByCardIds(cardRows.map((row) => row.id));
  if (!zonesRes.ok) return zonesRes;

  const cardsByGame = new Map<string, FlashWordCard[]>();
  for (const row of cardRows) {
    const mapped = mapCard(row, zonesRes.zonesByCardId.get(row.id) ?? []);
    if (!mapped) continue;
    const list = cardsByGame.get(mapped.gameId) ?? [];
    list.push(mapped);
    cardsByGame.set(mapped.gameId, list);
  }

  const games = (gamesRes.data as DbFlashWordGame[])
    .map((row) =>
      mapGame(row, cardsByGame.get(row.id) ?? [], tripletsByGame.get(row.id) ?? []),
    )
    .filter((game): game is FlashWordGame => game != null);

  return { ok: true, games };
}

async function uploadFlashGameImage(
  storagePath: string,
  file: Blob,
  mimeType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage.from(FLASH_GAME_BUCKET).upload(storagePath, file, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) return { ok: false, error: formatUploadError(error) };
  return { ok: true };
}

async function deleteFlashGameImages(
  storagePaths: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (storagePaths.length === 0) return { ok: true };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase.storage.from(FLASH_GAME_BUCKET).remove(storagePaths);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function replaceGameTriplets(
  gameId: string,
  triplets: FlashWordTripletInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error: deleteError } = await supabase
    .from('flash_word_game_rounds')
    .delete()
    .eq('game_id', gameId);

  if (deleteError) return { ok: false, error: formatDbError(deleteError) };

  if (triplets.length === 0) return { ok: true };

  const { error: insertError } = await supabase.from('flash_word_game_rounds').insert(
    triplets.map((triplet, index) => ({
      game_id: gameId,
      word_1: triplet.word1.trim(),
      word_2: triplet.word2.trim(),
      word_3: triplet.word3.trim(),
      sort_order: index,
    })),
  );

  if (insertError) return { ok: false, error: formatDbError(insertError) };
  return { ok: true };
}

export type CardFileEntry = {
  cardIndex: number;
  file: File;
};

async function replaceGameCards(
  gameId: string,
  cards: FlashWordCardInput[],
  cardFiles: CardFileEntry[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existingRes = await fetchCardsForGame(gameId);
  if (!existingRes.ok) return existingRes;

  const existingById = new Map(existingRes.cards.map((card) => [card.id, card]));
  const keptIds = new Set<string>();
  const pathsToDelete: string[] = [];

  for (let index = 0; index < cards.length; index += 1) {
    const cardInput = cards[index]!;
    const fileEntry = cardFiles.find((entry) => entry.cardIndex === index);
    const zone = normalizeZone(cardInput.zone);

    if (cardInput.id && existingById.has(cardInput.id)) {
      keptIds.add(cardInput.id);
      const existing = existingById.get(cardInput.id)!;
      let imagePath = existing.imagePath;

      if (fileEntry) {
        if (!fileEntry.file.type.startsWith('image/')) {
          return { ok: false, error: 'Only image files are allowed.' };
        }
        if (fileEntry.file.size > MAX_FLASH_GAME_IMAGE_BYTES) {
          return {
            ok: false,
            error: `Image too large. Max ${MAX_FLASH_GAME_IMAGE_BYTES / (1024 * 1024)} MB.`,
          };
        }
        const nextPath = flashCardStoragePath(
          gameId,
          cardInput.id,
          fileEntry.file.name || 'image.jpg',
        );
        const uploaded = await uploadFlashGameImage(
          nextPath,
          fileEntry.file,
          fileEntry.file.type,
        );
        if (!uploaded.ok) return uploaded;
        if (nextPath !== existing.imagePath) {
          pathsToDelete.push(existing.imagePath);
        }
        imagePath = nextPath;
      }

      const { error } = await supabase
        .from('flash_word_cards')
        .update({
          image_path: imagePath,
          zone_x_pct: zone.xPct,
          zone_y_pct: zone.yPct,
          zone_width_pct: zone.widthPct,
          zone_height_pct: zone.heightPct,
          sort_order: index,
        })
        .eq('id', cardInput.id);

      if (error) return { ok: false, error: formatDbError(error) };

      const distractionResult = await replaceCardDistractionZones(
        cardInput.id,
        cardInput.distractionZones ?? [],
      );
      if (!distractionResult.ok) return distractionResult;
      continue;
    }

    if (!fileEntry) {
      return { ok: false, error: 'Each new card needs an image upload.' };
    }
    if (!fileEntry.file.type.startsWith('image/')) {
      return { ok: false, error: 'Only image files are allowed.' };
    }
    if (fileEntry.file.size > MAX_FLASH_GAME_IMAGE_BYTES) {
      return {
        ok: false,
        error: `Image too large. Max ${MAX_FLASH_GAME_IMAGE_BYTES / (1024 * 1024)} MB.`,
      };
    }

    const cardId = crypto.randomUUID();
    const imagePath = flashCardStoragePath(
      gameId,
      cardId,
      fileEntry.file.name || 'image.jpg',
    );
    const uploaded = await uploadFlashGameImage(
      imagePath,
      fileEntry.file,
      fileEntry.file.type,
    );
    if (!uploaded.ok) return uploaded;

    const { error } = await supabase.from('flash_word_cards').insert({
      id: cardId,
      game_id: gameId,
      image_path: imagePath,
      zone_x_pct: zone.xPct,
      zone_y_pct: zone.yPct,
      zone_width_pct: zone.widthPct,
      zone_height_pct: zone.heightPct,
      sort_order: index,
    });

    if (error) {
      await deleteFlashGameImages([imagePath]);
      return { ok: false, error: formatDbError(error) };
    }

    const distractionResult = await replaceCardDistractionZones(
      cardId,
      cardInput.distractionZones ?? [],
    );
    if (!distractionResult.ok) return distractionResult;
  }

  for (const existing of existingRes.cards) {
    if (!keptIds.has(existing.id)) {
      pathsToDelete.push(existing.imagePath);
      const { error } = await supabase
        .from('flash_word_cards')
        .delete()
        .eq('id', existing.id);
      if (error) return { ok: false, error: formatDbError(error) };
    }
  }

  const deleteResult = await deleteFlashGameImages(pathsToDelete);
  if (!deleteResult.ok) return deleteResult;

  return { ok: true };
}

export async function createFlashWordGame(
  input: FlashWordGameInput,
  cardFiles: CardFileEntry[],
): Promise<{ ok: true; game: FlashWordGame } | { ok: false; error: string }> {
  const validationError = validateGameInput(input);
  if (validationError) return { ok: false, error: validationError };

  const newCardIndices = input.cards.map((_, index) => index);
  const missingFiles = newCardIndices.filter(
    (index) => !cardFiles.some((entry) => entry.cardIndex === index),
  );
  if (missingFiles.length > 0) {
    return { ok: false, error: 'Each flash card needs an image upload.' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from('flash_word_games')
    .insert({
      id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      flash_duration_ms: input.flashDurationMs,
      distraction_zones_enabled: input.distractionZonesEnabled,
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error ? formatDbError(error) : 'Save failed.' };
  }

  const cardsResult = await replaceGameCards(id, input.cards, cardFiles);
  if (!cardsResult.ok) {
    await supabase.from('flash_word_games').delete().eq('id', id);
    return cardsResult;
  }

  const tripletsResult = await replaceGameTriplets(id, input.triplets);
  if (!tripletsResult.ok) {
    await supabase.from('flash_word_games').delete().eq('id', id);
    return tripletsResult;
  }

  const loaded = await fetchFlashWordGame(id);
  if (!loaded.ok) return loaded;
  return { ok: true, game: loaded.game };
}

export async function updateFlashWordGame(
  gameId: string,
  input: FlashWordGameInput,
  cardFiles: CardFileEntry[] = [],
): Promise<{ ok: true; game: FlashWordGame } | { ok: false; error: string }> {
  const validationError = validateGameInput(input);
  if (validationError) return { ok: false, error: validationError };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existing = await fetchFlashWordGame(gameId);
  if (!existing.ok) return existing;

  for (let index = 0; index < input.cards.length; index += 1) {
    const card = input.cards[index]!;
    if (!card.id && !cardFiles.some((entry) => entry.cardIndex === index)) {
      return { ok: false, error: 'Each new flash card needs an image upload.' };
    }
  }

  const { error } = await supabase
    .from('flash_word_games')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      flash_duration_ms: input.flashDurationMs,
      distraction_zones_enabled: input.distractionZonesEnabled,
    })
    .eq('id', gameId);

  if (error) return { ok: false, error: formatDbError(error) };

  const cardsResult = await replaceGameCards(gameId, input.cards, cardFiles);
  if (!cardsResult.ok) return cardsResult;

  const tripletsResult = await replaceGameTriplets(gameId, input.triplets);
  if (!tripletsResult.ok) return tripletsResult;

  const loaded = await fetchFlashWordGame(gameId);
  if (!loaded.ok) return loaded;
  return { ok: true, game: loaded.game };
}

export async function deleteFlashWordGame(
  gameId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existing = await fetchFlashWordGame(gameId);
  if (!existing.ok) return existing;

  const imagePaths = existing.game.cards.map((card) => card.imagePath);

  const { error } = await supabase.from('flash_word_games').delete().eq('id', gameId);
  if (error) return { ok: false, error: formatDbError(error) };

  await deleteFlashGameImages(imagePaths);
  return { ok: true };
}

function mapSavedCombination(row: DbFlashWordSavedCombination): FlashWordSavedCombination {
  return {
    id: row.id,
    word1: row.word_1,
    word2: row.word_2,
    word3: row.word_3,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export async function fetchSavedCombinations(): Promise<
  { ok: true; combinations: FlashWordSavedCombination[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('flash_word_saved_combinations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatDbError(error) };

  return {
    ok: true,
    combinations: (data as DbFlashWordSavedCombination[]).map(mapSavedCombination),
  };
}

export async function saveCombinationToLibrary(
  triplet: FlashWordTripletInput,
): Promise<
  | { ok: true; combination: FlashWordSavedCombination; duplicate: false }
  | { ok: true; duplicate: true }
  | { ok: false; error: string }
> {
  const validationError = validateTripletInput(triplet);
  if (validationError) return { ok: false, error: validationError };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    word_1: triplet.word1.trim(),
    word_2: triplet.word2.trim(),
    word_3: triplet.word3.trim(),
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from('flash_word_saved_combinations')
    .insert(row)
    .select('*')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return { ok: true, duplicate: true };
    return { ok: false, error: formatDbError(error) };
  }

  if (!data) return { ok: false, error: 'Save to library failed.' };
  return {
    ok: true,
    duplicate: false,
    combination: mapSavedCombination(data as DbFlashWordSavedCombination),
  };
}

export async function saveCombinationsToLibrary(
  triplets: FlashWordTripletInput[],
): Promise<
  | { ok: true; savedCount: number; skippedCount: number; duplicateCount: number }
  | { ok: false; error: string }
> {
  let savedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;

  for (const triplet of triplets) {
    const validationError = validateTripletInput(triplet);
    if (validationError) {
      skippedCount += 1;
      continue;
    }

    const result = await saveCombinationToLibrary(triplet);
    if (!result.ok) return result;
    if (result.duplicate) {
      duplicateCount += 1;
    } else {
      savedCount += 1;
    }
  }

  return { ok: true, savedCount, skippedCount, duplicateCount };
}

export async function deleteSavedCombination(
  combinationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { error } = await supabase
    .from('flash_word_saved_combinations')
    .delete()
    .eq('id', combinationId);

  if (error) return { ok: false, error: formatDbError(error) };
  return { ok: true };
}
