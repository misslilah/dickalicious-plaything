import { useId } from 'react';
import type { CharacterAppearance } from '../types';
import { resolveSpriteLayers } from '../lib/characterSprite';

export type CharacterSpriteSize = 'small' | 'medium' | 'large';

const SIZE_CLASS: Record<CharacterSpriteSize, string> = {
  small: 'character-sprite--small',
  medium: 'character-sprite--medium',
  large: 'character-sprite--large',
};

interface CharacterSpriteProps {
  appearance: CharacterAppearance | null;
  size?: CharacterSpriteSize;
  className?: string;
  label?: string;
}

/**
 * Layered paper-doll SVG.
 * Groups: female-base / male-base, female-breast-{size}, male-penis-{size}.
 * Clothes later: sibling groups keyed by body variant (see characterSprite.ts).
 */
export function CharacterSprite({
  appearance,
  size = 'medium',
  className,
  label,
}: CharacterSpriteProps) {
  const uid = useId().replace(/:/g, '');
  const gender = appearance?.gender ?? null;
  const layerIds = new Set(
    appearance ? resolveSpriteLayers(appearance).map((layer) => layer.spriteId) : [],
  );
  const show = (spriteId: string) => (layerIds.has(spriteId) ? 'visible' : 'hidden');
  const caption =
    label ??
    (gender
      ? `Stylized ${gender} paper-doll character`
      : 'Character preview');

  return (
    <div
      className={['character-sprite', SIZE_CLASS[size], className]
        .filter(Boolean)
        .join(' ')}
    >
      <svg
        className="character-sprite__svg"
        viewBox="0 0 200 400"
        role="img"
        aria-label={caption}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`cs-skin-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7cfc0" />
            <stop offset="100%" stopColor="#e8a994" />
          </linearGradient>
          <linearGradient id={`cs-hair-f-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0abfc" />
            <stop offset="55%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
          <linearGradient id={`cs-hair-m-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6b3d7a" />
            <stop offset="100%" stopColor="#2a163a" />
          </linearGradient>
          <radialGradient id={`cs-blush-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff4fbf" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ff4fbf" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`cs-gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe08a" />
            <stop offset="100%" stopColor="#f5c84c" />
          </linearGradient>
        </defs>

        <ellipse
          cx="100"
          cy="378"
          rx="42"
          ry="8"
          fill="rgba(42, 22, 58, 0.35)"
        />

        {gender === 'female' && (
          <>
            <g id="female-base">
              <path
                d="M62 86 C48 150 40 210 52 268 C44 310 48 350 58 372
                   L78 372 C74 330 78 250 88 210
                   L112 210 C122 250 126 330 122 372
                   L142 372 C152 350 156 310 148 268
                   C160 210 152 150 138 86 Z"
                fill={`url(#cs-hair-f-${uid})`}
              />
              <path
                d="M78 96 C72 118 70 150 78 188
                   C70 214 64 236 70 258
                   C76 278 86 292 100 294
                   C114 292 124 278 130 258
                   C136 236 130 214 122 188
                   C130 150 128 118 122 96
                   C116 88 84 88 78 96 Z"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.4"
              />
              <path
                d="M76 108 C58 128 50 168 56 198
                   C60 214 70 218 76 204
                   C80 186 82 150 80 122 Z"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.3"
              />
              <path
                d="M124 108 C142 128 150 168 144 198
                   C140 214 130 218 124 204
                   C120 186 118 150 120 122 Z"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.3"
              />
              <path
                d="M82 288 C78 320 76 348 80 372
                   C86 374 94 374 96 370
                   C96 340 98 312 100 294
                   C102 312 104 340 104 370
                   C106 374 114 374 120 372
                   C124 348 122 320 118 288 Z"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.4"
              />
              <ellipse
                cx="88"
                cy="372"
                rx="10"
                ry="4.5"
                fill="#e09a88"
                stroke="#5a2d4a"
                strokeWidth="1"
              />
              <ellipse
                cx="112"
                cy="372"
                rx="10"
                ry="4.5"
                fill="#e09a88"
                stroke="#5a2d4a"
                strokeWidth="1"
              />
              <circle
                cx="100"
                cy="52"
                r="28"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.4"
              />
              <path
                d="M72 48 C74 18 90 8 100 10
                   C110 8 126 18 128 48
                   C132 34 128 20 118 14
                   C110 8 90 8 82 14
                   C72 20 68 34 72 48 Z"
                fill={`url(#cs-hair-f-${uid})`}
              />
              <path
                d="M74 44 C80 32 90 28 100 30
                   C110 28 120 32 126 44
                   C118 38 110 36 100 38
                   C90 36 82 38 74 44 Z"
                fill="#e879f9"
              />
              <rect
                x="94"
                y="78"
                width="12"
                height="16"
                rx="4"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1"
              />
              <circle cx="90" cy="56" r="7" fill={`url(#cs-blush-${uid})`} />
              <circle cx="110" cy="56" r="7" fill={`url(#cs-blush-${uid})`} />
              <ellipse cx="90" cy="50" rx="3.2" ry="3.6" fill="#3b1d4a" />
              <ellipse cx="110" cy="50" rx="3.2" ry="3.6" fill="#3b1d4a" />
              <circle cx="91.2" cy="49" r="1" fill="#fff" />
              <circle cx="111.2" cy="49" r="1" fill="#fff" />
              <path
                d="M94 62 Q100 67 106 62"
                fill="none"
                stroke="#b45a72"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <circle cx="124" cy="58" r="2.4" fill={`url(#cs-gold-${uid})`} />
              <path
                d="M84 188 Q100 198 116 188"
                fill="none"
                stroke="#d88978"
                strokeWidth="1.1"
                opacity="0.7"
              />
            </g>

            <g
              id="female-breast-small"
              visibility={show('female-breast-small')}
            >
              <ellipse
                cx="88"
                cy="128"
                rx="11"
                ry="9"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.2"
              />
              <ellipse
                cx="112"
                cy="128"
                rx="11"
                ry="9"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.2"
              />
              <circle cx="89" cy="130" r="2.1" fill="#d46a88" />
              <circle cx="113" cy="130" r="2.1" fill="#d46a88" />
            </g>
            <g
              id="female-breast-medium"
              visibility={show('female-breast-medium')}
            >
              <ellipse
                cx="86"
                cy="130"
                rx="16"
                ry="13"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.2"
              />
              <ellipse
                cx="114"
                cy="130"
                rx="16"
                ry="13"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.2"
              />
              <circle cx="88" cy="133" r="2.6" fill="#d46a88" />
              <circle cx="116" cy="133" r="2.6" fill="#d46a88" />
            </g>
            <g
              id="female-breast-large"
              visibility={show('female-breast-large')}
            >
              <ellipse
                cx="84"
                cy="134"
                rx="21"
                ry="17"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.2"
              />
              <ellipse
                cx="116"
                cy="134"
                rx="21"
                ry="17"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.2"
              />
              <circle cx="86" cy="138" r="3.1" fill="#d46a88" />
              <circle cx="118" cy="138" r="3.1" fill="#d46a88" />
            </g>
          </>
        )}

        {gender === 'male' && (
          <>
            <g id="male-base">
              <path
                d="M70 96 C52 130 46 176 58 230
                   C50 270 52 320 62 372
                   L82 372 C78 328 80 270 88 232
                   L112 232 C120 270 122 328 118 372
                   L138 372 C148 320 150 270 142 230
                   C154 176 148 130 130 96 Z"
                fill="none"
              />
              <path
                d="M70 98 C60 124 56 160 64 198
                   C56 226 52 250 60 272
                   C68 292 84 302 100 304
                   C116 302 132 292 140 272
                   C148 250 144 226 136 198
                   C144 160 140 124 130 98
                   C122 88 78 88 70 98 Z"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.4"
              />
              <path
                d="M68 108 C48 130 40 172 48 204
                   C52 220 64 222 70 206
                   C74 184 76 148 74 122 Z"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.3"
              />
              <path
                d="M132 108 C152 130 160 172 152 204
                   C148 220 136 222 130 206
                   C126 184 124 148 126 122 Z"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.3"
              />
              <path
                d="M80 300 C76 330 74 352 78 372
                   C84 374 94 374 96 370
                   C96 338 98 318 100 304
                   C102 318 104 338 104 370
                   C106 374 116 374 122 372
                   C126 352 124 330 120 300 Z"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.4"
              />
              <ellipse
                cx="88"
                cy="372"
                rx="11"
                ry="4.5"
                fill="#e09a88"
                stroke="#5a2d4a"
                strokeWidth="1"
              />
              <ellipse
                cx="112"
                cy="372"
                rx="11"
                ry="4.5"
                fill="#e09a88"
                stroke="#5a2d4a"
                strokeWidth="1"
              />
              <circle
                cx="100"
                cy="50"
                r="30"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.4"
              />
              <path
                d="M70 48 C72 16 88 6 100 8
                   C112 6 128 16 130 48
                   C128 28 118 18 100 18
                   C82 18 72 28 70 48 Z"
                fill={`url(#cs-hair-m-${uid})`}
              />
              <rect
                x="93"
                y="78"
                width="14"
                height="16"
                rx="4"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1"
              />
              <ellipse cx="89" cy="48" rx="3.4" ry="3.8" fill="#3b1d4a" />
              <ellipse cx="111" cy="48" rx="3.4" ry="3.8" fill="#3b1d4a" />
              <circle cx="90.4" cy="47" r="1" fill="#fff" />
              <circle cx="112.4" cy="47" r="1" fill="#fff" />
              <path
                d="M94 62 Q100 65 106 62"
                fill="none"
                stroke="#b45a72"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M82 118 Q100 126 118 118"
                fill="none"
                stroke="#d88978"
                strokeWidth="1.1"
                opacity="0.55"
              />
              <rect
                x="96"
                y="88"
                width="8"
                height="3"
                rx="1"
                fill={`url(#cs-gold-${uid})`}
                opacity="0.85"
              />
            </g>

            <g
              id="male-penis-small"
              visibility={show('male-penis-small')}
            >
              <ellipse
                cx="94"
                cy="300"
                rx="6"
                ry="5"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.1"
              />
              <ellipse
                cx="106"
                cy="300"
                rx="6"
                ry="5"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.1"
              />
              <path
                d="M97 298 Q100 312 103 298"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.15"
              />
              <ellipse cx="100" cy="311" rx="3.2" ry="2.4" fill="#e09a88" />
            </g>
            <g
              id="male-penis-medium"
              visibility={show('male-penis-medium')}
            >
              <ellipse
                cx="93"
                cy="301"
                rx="7"
                ry="5.5"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.1"
              />
              <ellipse
                cx="107"
                cy="301"
                rx="7"
                ry="5.5"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.1"
              />
              <path
                d="M96 298 Q100 322 104 298"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.15"
              />
              <ellipse cx="100" cy="321" rx="3.6" ry="2.7" fill="#e09a88" />
            </g>
            <g
              id="male-penis-large"
              visibility={show('male-penis-large')}
            >
              <ellipse
                cx="92"
                cy="302"
                rx="8"
                ry="6"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.1"
              />
              <ellipse
                cx="108"
                cy="302"
                rx="8"
                ry="6"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.1"
              />
              <path
                d="M95 298 Q100 334 105 298"
                fill={`url(#cs-skin-${uid})`}
                stroke="#5a2d4a"
                strokeWidth="1.15"
              />
              <ellipse cx="100" cy="333" rx="4" ry="3" fill="#e09a88" />
            </g>
          </>
        )}

        {!gender && (
          <g id="character-empty">
            <circle
              cx="100"
              cy="160"
              r="48"
              fill="rgba(192, 132, 252, 0.12)"
              stroke="rgba(192, 132, 252, 0.4)"
              strokeWidth="2"
              strokeDasharray="6 5"
            />
            <path
              d="M100 136 v28 M86 150 h28"
              stroke="rgba(240, 171, 252, 0.85)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* Paid shop clothes: resolveSpriteLayers() emits clothes-* ids into this group. */}
        <g id="clothes-layer" />
      </svg>
    </div>
  );
}
