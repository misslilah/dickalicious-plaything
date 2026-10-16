import type {
  CharacterAppearance,
  CharacterBodySize,
  CharacterBodyVariant,
  CharacterEquipped,
  CharacterGender,
  ClothingSlot,
  Session,
} from '../types';

/**
 * Layered paper-doll renderer (not one flattened PNG per combo).
 *
 * Render stack (bottom → top):
 *   1. Base body          — female | male nude silhouette
 *   2. Size overlay       — breasts (female) or penis (male) S/M/L
 *   3. Clothes (future)   — underwear → bottom → top, each keyed by body variant
 *
 * Paid shop (later):
 *   - Sell a garment once; persist the pick in `profiles.character_equipped`
 *     as `{ top | bottom | underwear: clothingId }`.
 *   - Each item carries `variantSprites` so the same panty/top has distinct art
 *     for `female-large`, `male-medium`, etc. (bulge, bust darts).
 *   - Missing variant falls back to the closest size, then hides that slot.
 *   - Do not bake clothes into the nude bases — keep layers independent.
 */

export const CHARACTER_GENDERS: CharacterGender[] = ['female', 'male'];
export const CHARACTER_BODY_SIZES: CharacterBodySize[] = ['small', 'medium', 'large'];

export const CHARACTER_SIZE_SHORT: Record<CharacterBodySize, string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
};

export const CHARACTER_SIZE_LABEL: Record<CharacterBodySize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

export const CHARACTER_GENDER_LABEL: Record<CharacterGender, string> = {
  female: 'Female',
  male: 'Male',
};

export const CLOTHING_SLOTS: ClothingSlot[] = ['underwear', 'bottom', 'top'];

/** Clothes draw after the nude stack, underwear first so tops cover them. */
export const CLOTHING_SLOT_LAYER: Record<ClothingSlot, number> = {
  underwear: 30,
  bottom: 40,
  top: 50,
};

export const NUDE_LAYER = {
  base: 10,
  size: 20,
} as const;

export const CHARACTER_MIGRATION_HINT =
  'Character appearance requires supabase/migrations/096_character_appearance.sql. Run it in the Supabase SQL Editor, then refresh.';

const PREVIEW_CHARACTER_STORAGE_KEY = 'admin-preview-character-v1';

export interface ClothingItem {
  id: string;
  name: string;
  slot: ClothingSlot;
  /** Draw order among clothes; higher is closer to the camera. */
  layer: number;
  /**
   * One sprite (asset id or SVG group) per body variant.
   * Paid shop must supply every variant that can wear the item
   * (e.g. panty bulge S/M/L, tops for large breasts).
   */
  variantSprites: Partial<Record<CharacterBodyVariant, string>>;
  /** True when the item is sold rather than a free starter. */
  paid?: boolean;
}

/**
 * Shop catalog stub — no UI yet. Add paid items here; the renderer already
 * resolves `variantSprites[bodyVariant]` onto the clothes layer.
 */
export const CLOTHING_CATALOG: ClothingItem[] = [];

export type SpriteLayerKind = 'base' | 'size' | 'clothes';

export interface SpriteLayer {
  id: string;
  kind: SpriteLayerKind;
  z: number;
  /** Asset / SVG group id to show. */
  spriteId: string;
  clothingId?: string;
  slot?: ClothingSlot;
}

export function emptyEquipped(): CharacterEquipped {
  return {};
}

export function parseEquipped(value: unknown): CharacterEquipped {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: CharacterEquipped = {};
  const row = value as Record<string, unknown>;
  for (const slot of CLOTHING_SLOTS) {
    const id = row[slot];
    if (typeof id === 'string' && id.trim()) {
      out[slot] = id.trim();
    }
  }
  return out;
}

export function parseCharacterGender(value: unknown): CharacterGender | null {
  return value === 'female' || value === 'male' ? value : null;
}

export function parseCharacterBodySize(value: unknown): CharacterBodySize | null {
  return value === 'small' || value === 'medium' || value === 'large' ? value : null;
}

export function bodySizeForGender(
  gender: CharacterGender,
  appearance: Pick<CharacterAppearance, 'breastSize' | 'penisSize'>,
): CharacterBodySize | null {
  return gender === 'female' ? appearance.breastSize : appearance.penisSize;
}

export function characterBodyVariant(
  gender: CharacterGender,
  size: CharacterBodySize,
): CharacterBodyVariant {
  return `${gender}-${size}`;
}

export function appearanceFromSession(
  session: Pick<
    Session,
    | 'characterGender'
    | 'characterBreastSize'
    | 'characterPenisSize'
    | 'characterEquipped'
  > | null,
): CharacterAppearance | null {
  if (!session?.characterGender) return null;
  return {
    gender: session.characterGender,
    breastSize: session.characterBreastSize,
    penisSize: session.characterPenisSize,
    equipped: session.characterEquipped ?? {},
  };
}

export function isCharacterComplete(appearance: CharacterAppearance | null): boolean {
  if (!appearance) return false;
  if (appearance.gender === 'female') {
    return appearance.breastSize != null;
  }
  return appearance.penisSize != null;
}

export function hasSavedCharacter(
  session: Pick<Session, 'characterGender' | 'characterBreastSize' | 'characterPenisSize'> | null,
): boolean {
  return isCharacterComplete(appearanceFromSession(session));
}

/** Regular users must finish the creator once. Admins and user-preview skip the gate. */
export function needsCharacterSetup(
  session: Pick<Session, 'role' | 'characterGender' | 'characterBreastSize' | 'characterPenisSize'> | null,
  adminUserPreview: boolean,
): boolean {
  if (!session || adminUserPreview || session.role === 'admin') return false;
  return !hasSavedCharacter(session);
}

export function characterSizeSummary(appearance: CharacterAppearance): string {
  const size =
    appearance.gender === 'female' ? appearance.breastSize : appearance.penisSize;
  const sizeLabel = size ? CHARACTER_SIZE_LABEL[size] : '—';
  if (appearance.gender === 'female') {
    return `${CHARACTER_GENDER_LABEL.female} · breasts ${sizeLabel}`;
  }
  return `${CHARACTER_GENDER_LABEL.male} · penis ${sizeLabel}`;
}

export function draftAppearance(
  gender: CharacterGender | null,
  size: CharacterBodySize | null,
  equipped: CharacterEquipped = {},
): CharacterAppearance | null {
  if (!gender) return null;
  return {
    gender,
    breastSize: gender === 'female' ? size : null,
    penisSize: gender === 'male' ? size : null,
    equipped,
  };
}

function closestSizeSprite(
  item: ClothingItem,
  gender: CharacterGender,
  size: CharacterBodySize,
): string | null {
  const exact = item.variantSprites[characterBodyVariant(gender, size)];
  if (exact) return exact;
  const fallbackOrder: CharacterBodySize[] =
    size === 'medium'
      ? ['small', 'large']
      : size === 'small'
        ? ['medium', 'large']
        : ['medium', 'small'];
  for (const next of fallbackOrder) {
    const sprite = item.variantSprites[characterBodyVariant(gender, next)];
    if (sprite) return sprite;
  }
  return null;
}

export function resolveClothingLayers(
  appearance: CharacterAppearance,
): SpriteLayer[] {
  const size = bodySizeForGender(appearance.gender, appearance);
  if (!size) return [];

  const layers: SpriteLayer[] = [];
  for (const slot of CLOTHING_SLOTS) {
    const clothingId = appearance.equipped[slot];
    if (!clothingId) continue;
    const item = CLOTHING_CATALOG.find((entry) => entry.id === clothingId);
    if (!item || item.slot !== slot) continue;
    const spriteId = closestSizeSprite(item, appearance.gender, size);
    if (!spriteId) continue;
    layers.push({
      id: `clothes-${slot}-${item.id}`,
      kind: 'clothes',
      z: item.layer || CLOTHING_SLOT_LAYER[slot],
      spriteId,
      clothingId: item.id,
      slot,
    });
  }
  return layers.sort((a, b) => a.z - b.z);
}

/** Full draw list for the paper-doll compositor. */
export function resolveSpriteLayers(appearance: CharacterAppearance): SpriteLayer[] {
  const size = bodySizeForGender(appearance.gender, appearance);
  const layers: SpriteLayer[] = [
    {
      id: `base-${appearance.gender}`,
      kind: 'base',
      z: NUDE_LAYER.base,
      spriteId: `${appearance.gender}-base`,
    },
  ];
  if (size) {
    const overlay =
      appearance.gender === 'female'
        ? `female-breast-${size}`
        : `male-penis-${size}`;
    layers.push({
      id: overlay,
      kind: 'size',
      z: NUDE_LAYER.size,
      spriteId: overlay,
    });
  }
  layers.push(...resolveClothingLayers(appearance));
  return layers.sort((a, b) => a.z - b.z);
}

export function readLocalPreviewCharacter(): CharacterAppearance | null {
  try {
    const raw = sessionStorage.getItem(PREVIEW_CHARACTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CharacterAppearance>;
    const gender = parseCharacterGender(parsed.gender);
    if (!gender) return null;
    const appearance: CharacterAppearance = {
      gender,
      breastSize: gender === 'female' ? parseCharacterBodySize(parsed.breastSize) : null,
      penisSize: gender === 'male' ? parseCharacterBodySize(parsed.penisSize) : null,
      equipped: parseEquipped(parsed.equipped),
    };
    return isCharacterComplete(appearance) ? appearance : null;
  } catch {
    return null;
  }
}

export function writeLocalPreviewCharacter(appearance: CharacterAppearance): void {
  try {
    sessionStorage.setItem(PREVIEW_CHARACTER_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // private mode / blocked storage
  }
}
