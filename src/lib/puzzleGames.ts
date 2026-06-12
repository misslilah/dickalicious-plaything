import { getSupabase } from './supabase';

export const PUZZLE_GAME_BUCKET = 'puzzle-game-images';

export const PUZZLE_PIECE_COUNTS = [4, 9, 16, 25, 36] as const;
export type PuzzlePieceCount = (typeof PUZZLE_PIECE_COUNTS)[number];

export type PuzzleRotationDirection = 'clockwise' | 'counterclockwise' | 'none';

export const PUZZLE_ROTATION_LABELS: Record<PuzzleRotationDirection, string> = {
  clockwise: 'Clockwise',
  counterclockwise: 'Counter-clockwise',
  none: 'No rotation',
};

export const MAX_PUZZLE_IMAGE_BYTES = 5 * 1024 * 1024;

export const PUZZLE_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

const MIGRATION_HINT =
  'Puzzle games are not set up yet. In Supabase SQL Editor, run supabase/migrations/062_puzzle_games.sql, then retry.';

const BUCKET_HINT =
  'The puzzle-game-images storage bucket is not set up yet. In Supabase SQL Editor, run supabase/migrations/062_puzzle_games.sql, then retry the upload.';

export interface PuzzleGame {
  id: string;
  title: string | null;
  imagePath: string;
  imageUrl: string;
  pieceCount: PuzzlePieceCount;
  rotationDirection: PuzzleRotationDirection;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface PuzzleGameSummary {
  id: string;
  title: string | null;
  imageUrl: string;
  pieceCount: PuzzlePieceCount;
  rotationDirection: PuzzleRotationDirection;
  gridSize: number;
  createdAt: string;
}

export interface PuzzleGameInput {
  title: string | null;
  pieceCount: PuzzlePieceCount;
  rotationDirection: PuzzleRotationDirection;
  isActive: boolean;
}

type DbPuzzleGame = {
  id: string;
  title: string | null;
  image_path: string;
  piece_count: number;
  rotation_direction: PuzzleRotationDirection;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

function formatDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? 'Unknown error';
  if (
    error.code === 'PGRST205' ||
    message.includes("Could not find the table 'public.puzzle_games'")
  ) {
    return MIGRATION_HINT;
  }
  return message;
}

function formatUploadError(error: { message?: string }): string {
  const message = error.message ?? 'Upload failed.';
  if (/bucket not found/i.test(message)) return BUCKET_HINT;
  return message;
}

async function nextPuzzleSortOrder(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data } = await supabase
    .from('puzzle_games')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { sort_order: number } | null;
  return (row?.sort_order ?? -1) + 1;
}

export function puzzleGridSize(pieceCount: PuzzlePieceCount): number {
  return Math.sqrt(pieceCount);
}

export function isPuzzlePieceCount(value: number): value is PuzzlePieceCount {
  return (PUZZLE_PIECE_COUNTS as readonly number[]).includes(value);
}

export function puzzleStoragePath(puzzleId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${puzzleId}/${safe}`;
}

export function getPuzzleImageUrl(storagePath: string): string | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  const normalized = storagePath.trim().replace(/^\/+/, '');
  if (!normalized) return null;
  const { data } = supabase.storage.from(PUZZLE_GAME_BUCKET).getPublicUrl(normalized);
  return data.publicUrl?.trim() || null;
}

export function puzzlePieceBackgroundStyle(
  correctIndex: number,
  pieceCount: PuzzlePieceCount,
  imageUrl: string,
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const gridSize = puzzleGridSize(pieceCount);
  const row = Math.floor(correctIndex / gridSize);
  const col = correctIndex % gridSize;
  const xPct = gridSize > 1 ? (col / (gridSize - 1)) * 100 : 0;
  const yPct = gridSize > 1 ? (row / (gridSize - 1)) * 100 : 0;
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
    backgroundPosition: `${xPct}% ${yPct}%`,
  };
}

export function puzzleDisplayTitle(game: Pick<PuzzleGameSummary, 'title'>): string {
  return game.title?.trim() || 'Puzzle';
}

function mapGame(row: DbPuzzleGame): PuzzleGame | null {
  const imageUrl = getPuzzleImageUrl(row.image_path);
  if (!imageUrl) return null;
  if (!isPuzzlePieceCount(row.piece_count)) return null;
  return {
    id: row.id,
    title: row.title,
    imagePath: row.image_path,
    imageUrl,
    pieceCount: row.piece_count,
    rotationDirection: row.rotation_direction,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function mapSummary(row: DbPuzzleGame): PuzzleGameSummary | null {
  const imageUrl = getPuzzleImageUrl(row.image_path);
  if (!imageUrl) return null;
  if (!isPuzzlePieceCount(row.piece_count)) return null;
  return {
    id: row.id,
    title: row.title,
    imageUrl,
    pieceCount: row.piece_count,
    rotationDirection: row.rotation_direction,
    gridSize: puzzleGridSize(row.piece_count),
    createdAt: row.created_at,
  };
}

function validateInput(input: PuzzleGameInput): string | null {
  if (!isPuzzlePieceCount(input.pieceCount)) {
    return 'Piece count must be a perfect square (4, 9, 16, 25, or 36).';
  }
  return null;
}

async function uploadImage(
  storagePath: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };
  const { error } = await supabase.storage.from(PUZZLE_GAME_BUCKET).upload(storagePath, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) return { ok: false, error: formatUploadError(error) };
  return { ok: true };
}

async function removeImages(paths: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(PUZZLE_GAME_BUCKET).remove(paths);
}

export const PUZZLE_SESSION_STREAK_KEY = 'puzzle-session-streak';

export function pickRandomPuzzle(
  puzzles: PuzzleGame[],
  excludeId?: string,
): PuzzleGame | null {
  if (puzzles.length === 0) return null;
  const candidates = excludeId
    ? puzzles.filter((puzzle) => puzzle.id !== excludeId)
    : puzzles;
  const pool = candidates.length > 0 ? candidates : puzzles;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export async function fetchActivePuzzleGames(): Promise<
  { ok: true; puzzles: PuzzleGame[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('puzzle_games')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatDbError(error) };

  const puzzles = (data as DbPuzzleGame[])
    .map(mapGame)
    .filter((puzzle): puzzle is PuzzleGame => puzzle !== null);

  return { ok: true, puzzles };
}

export async function fetchPuzzleGameSummaries(): Promise<
  { ok: true; puzzles: PuzzleGameSummary[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('puzzle_games')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatDbError(error) };

  const puzzles = (data as DbPuzzleGame[])
    .map(mapSummary)
    .filter((puzzle): puzzle is PuzzleGameSummary => puzzle !== null);

  return { ok: true, puzzles };
}

export async function fetchPuzzleGame(
  puzzleId: string,
): Promise<{ ok: true; puzzle: PuzzleGame } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('puzzle_games')
    .select('*')
    .eq('id', puzzleId)
    .maybeSingle();

  if (error) return { ok: false, error: formatDbError(error) };
  if (!data) return { ok: false, error: 'Puzzle not found.' };

  const puzzle = mapGame(data as DbPuzzleGame);
  if (!puzzle) return { ok: false, error: 'Puzzle image could not be loaded.' };
  return { ok: true, puzzle };
}

export async function fetchAllPuzzleGames(): Promise<
  { ok: true; puzzles: PuzzleGame[] } | { ok: false; error: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const { data, error } = await supabase
    .from('puzzle_games')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: formatDbError(error) };

  const puzzles = (data as DbPuzzleGame[])
    .map(mapGame)
    .filter((puzzle): puzzle is PuzzleGame => puzzle !== null);

  return { ok: true, puzzles };
}

export async function createPuzzleGame(
  input: PuzzleGameInput,
  imageFile: File,
): Promise<{ ok: true; puzzle: PuzzleGame } | { ok: false; error: string }> {
  const validation = validateInput(input);
  if (validation) return { ok: false, error: validation };
  if (!imageFile.type.startsWith('image/')) {
    return { ok: false, error: 'Only image files are allowed.' };
  }
  if (imageFile.size > MAX_PUZZLE_IMAGE_BYTES) {
    return { ok: false, error: 'Image must be 5 MB or smaller.' };
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const puzzleId = crypto.randomUUID();
  const imagePath = puzzleStoragePath(puzzleId, imageFile.name || 'puzzle.jpg');
  const uploaded = await uploadImage(imagePath, imageFile);
  if (!uploaded.ok) return uploaded;

  const sortOrder = await nextPuzzleSortOrder();

  const { data, error } = await supabase
    .from('puzzle_games')
    .insert({
      id: puzzleId,
      title: input.title?.trim() || null,
      image_path: imagePath,
      piece_count: input.pieceCount,
      rotation_direction: input.rotationDirection,
      is_active: input.isActive,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) {
    await removeImages([imagePath]);
    return { ok: false, error: formatDbError(error) };
  }

  const puzzle = mapGame(data as DbPuzzleGame);
  if (!puzzle) {
    await removeImages([imagePath]);
    return { ok: false, error: 'Puzzle was created but could not be loaded.' };
  }
  return { ok: true, puzzle };
}

export async function updatePuzzleGame(
  puzzleId: string,
  input: PuzzleGameInput,
  imageFile?: File,
): Promise<{ ok: true; puzzle: PuzzleGame } | { ok: false; error: string }> {
  const validation = validateInput(input);
  if (validation) return { ok: false, error: validation };

  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existing = await fetchPuzzleGame(puzzleId);
  if (!existing.ok) return existing;

  let imagePath = existing.puzzle.imagePath;
  let previousPath: string | null = null;

  if (imageFile) {
    if (!imageFile.type.startsWith('image/')) {
      return { ok: false, error: 'Only image files are allowed.' };
    }
    if (imageFile.size > MAX_PUZZLE_IMAGE_BYTES) {
      return { ok: false, error: 'Image must be 5 MB or smaller.' };
    }
    const nextPath = puzzleStoragePath(puzzleId, imageFile.name || 'puzzle.jpg');
    const uploaded = await uploadImage(nextPath, imageFile);
    if (!uploaded.ok) return uploaded;
    previousPath = imagePath;
    imagePath = nextPath;
  }

  const { data, error } = await supabase
    .from('puzzle_games')
    .update({
      title: input.title?.trim() || null,
      image_path: imagePath,
      piece_count: input.pieceCount,
      rotation_direction: input.rotationDirection,
      is_active: input.isActive,
    })
    .eq('id', puzzleId)
    .select('*')
    .single();

  if (error) return { ok: false, error: formatDbError(error) };

  if (previousPath && previousPath !== imagePath) {
    await removeImages([previousPath]);
  }

  const puzzle = mapGame(data as DbPuzzleGame);
  if (!puzzle) return { ok: false, error: 'Puzzle was saved but could not be loaded.' };
  return { ok: true, puzzle };
}

export async function deletePuzzleGame(
  puzzleId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const existing = await fetchPuzzleGame(puzzleId);
  if (!existing.ok) return existing;

  const { error } = await supabase.from('puzzle_games').delete().eq('id', puzzleId);
  if (error) return { ok: false, error: formatDbError(error) };

  await removeImages([existing.puzzle.imagePath]);
  return { ok: true };
}

export async function updatePuzzleSortOrders(
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from('puzzle_games')
      .update({ sort_order: index })
      .eq('id', orderedIds[index]);
    if (error) return { ok: false, error: formatDbError(error) };
  }

  return { ok: true };
}

export type PuzzlePieceState = {
  correctIndex: number;
  slotIndex: number;
  rotation: 0 | 90 | 180 | 270;
};

export function createShuffledPuzzlePieces(
  pieceCount: PuzzlePieceCount,
  rotationDirection: PuzzleRotationDirection,
): PuzzlePieceState[] {
  const pieces: PuzzlePieceState[] = Array.from({ length: pieceCount }, (_, correctIndex) => ({
    correctIndex,
    slotIndex: correctIndex,
    rotation: 0,
  }));

  const shuffleSlots = () => {
    for (let i = pieces.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = pieces[i]!.slotIndex;
      pieces[i]!.slotIndex = pieces[j]!.slotIndex;
      pieces[j]!.slotIndex = temp;
    }
  };

  const assignRotations = () => {
    if (rotationDirection === 'none') return;
    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    for (const piece of pieces) {
      const options = rotations.filter((value) => value !== 0);
      piece.rotation = options[Math.floor(Math.random() * options.length)] ?? 90;
    }
  };

  let attempts = 0;
  do {
    for (const piece of pieces) {
      piece.slotIndex = piece.correctIndex;
      piece.rotation = 0;
    }
    shuffleSlots();
    assignRotations();
    attempts += 1;
  } while (isPuzzleSolved(pieces) && attempts < 20);

  return pieces;
}

export function isPuzzleSolved(pieces: PuzzlePieceState[]): boolean {
  return pieces.every(
    (piece) => piece.slotIndex === piece.correctIndex && piece.rotation === 0,
  );
}

export function rotatePuzzlePiece(
  piece: PuzzlePieceState,
  direction: PuzzleRotationDirection,
): PuzzlePieceState {
  if (direction === 'none') return piece;
  const delta = direction === 'clockwise' ? 90 : -90;
  const next = (piece.rotation + delta + 360) % 360;
  return {
    ...piece,
    rotation: next as 0 | 90 | 180 | 270,
  };
}

export function swapPuzzlePiecesAtSlots(
  pieces: PuzzlePieceState[],
  slotA: number,
  slotB: number,
): PuzzlePieceState[] {
  if (slotA === slotB) return pieces;
  const bySlot = new Map(pieces.map((piece) => [piece.slotIndex, piece]));
  const pieceA = bySlot.get(slotA);
  const pieceB = bySlot.get(slotB);
  if (!pieceA || !pieceB) return pieces;
  return pieces.map((piece) => {
    if (piece.correctIndex === pieceA.correctIndex) {
      return { ...piece, slotIndex: slotB };
    }
    if (piece.correctIndex === pieceB.correctIndex) {
      return { ...piece, slotIndex: slotA };
    }
    return piece;
  });
}
