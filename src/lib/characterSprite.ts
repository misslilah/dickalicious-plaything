import type {
  CharacterAppearance,
  CharacterBodySize,
  CharacterGender,
  Session,
} from '../types';

/**
 * Layered paper-doll renderer (not one flattened PNG per combo).
 *
 * Render stack (bottom → top):
 *   1. Base body     — female | male silhouette (hair, face, torso, limbs)
 *   2. Size overlay  — breasts (female) or penis (male) S/M/L
 *
 * There is no clothing system. Old values saved in
 * `profiles.character_equipped` are never read, written or rendered.
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

export const BODY_LAYER = {
  base: 10,
  size: 20,
} as const;

export const CHARACTER_MIGRATION_HINT =
  'Character appearance requires supabase/migrations/096_character_appearance.sql. Run it in the Supabase SQL Editor, then refresh.';

const PREVIEW_CHARACTER_STORAGE_KEY = 'admin-preview-character-v1';

export type SpriteLayerKind = 'base' | 'size';

export interface SpriteLayer {
  id: string;
  kind: SpriteLayerKind;
  z: number;
  /** Asset / SVG group id to show. */
  spriteId: string;
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

export function appearanceFromSession(
  session: Pick<
    Session,
    'characterGender' | 'characterBreastSize' | 'characterPenisSize'
  > | null,
): CharacterAppearance | null {
  if (!session?.characterGender) return null;
  return {
    gender: session.characterGender,
    breastSize: session.characterBreastSize,
    penisSize: session.characterPenisSize,
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
  session: Pick<
    Session,
    'characterGender' | 'characterBreastSize' | 'characterPenisSize'
  > | null,
): boolean {
  return isCharacterComplete(appearanceFromSession(session));
}

/** Regular users must finish the creator once. Admins and user-preview skip the gate. */
export function needsCharacterSetup(
  session: Pick<
    Session,
    'role' | 'characterGender' | 'characterBreastSize' | 'characterPenisSize'
  > | null,
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
): CharacterAppearance | null {
  if (!gender) return null;
  return {
    gender,
    breastSize: gender === 'female' ? size : null,
    penisSize: gender === 'male' ? size : null,
  };
}

/** Full draw list for the paper-doll compositor. */
export function resolveSpriteLayers(appearance: CharacterAppearance): SpriteLayer[] {
  const size = bodySizeForGender(appearance.gender, appearance);
  const layers: SpriteLayer[] = [
    {
      id: `base-${appearance.gender}`,
      kind: 'base',
      z: BODY_LAYER.base,
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
      z: BODY_LAYER.size,
      spriteId: overlay,
    });
  }
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
    };
    return isCharacterComplete(appearance) ? appearance : null;
  } catch {
    return null;
  }
}

export function writeLocalPreviewCharacter(appearance: CharacterAppearance): void {
  try {
    sessionStorage.setItem(
      PREVIEW_CHARACTER_STORAGE_KEY,
      JSON.stringify({
        gender: appearance.gender,
        breastSize: appearance.breastSize,
        penisSize: appearance.penisSize,
      }),
    );
  } catch {
    // private mode / blocked storage
  }
}
