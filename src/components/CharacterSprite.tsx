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

const INK = '#7a3a5e';
const INK_W = 1.2;

/* Shared silhouettes. */
/** Shoulder-blade length hair that flows out of the head (tapered tips, no hard cut). */
const F_HAIR_BACK =
  'M100 9 C78 9 66 26 67 52 C60 84 52 122 54 168 C55 206 50 238 58 270 C63 288 77 291 83 277 C88 252 85 214 87 172 L113 172 C115 214 112 252 117 277 C123 291 137 288 142 270 C150 238 145 206 146 168 C148 122 140 84 133 52 C134 26 122 9 100 9 Z';
const F_TORSO =
  'M78 96 C72 118 70 150 78 188 C70 214 64 236 70 258 C76 278 86 292 100 294 C114 292 124 278 130 258 C136 236 130 214 122 188 C130 150 128 118 122 96 C116 88 84 88 78 96 Z';
const F_ARM_L = 'M76 108 C58 128 50 168 56 198 C60 214 70 218 76 204 C80 186 82 150 80 122 Z';
const F_ARM_R = 'M124 108 C142 128 150 168 144 198 C140 214 130 218 124 204 C120 186 118 150 120 122 Z';
const F_LEGS =
  'M82 288 C78 320 76 348 80 372 C86 374 94 374 96 370 C96 340 98 312 100 294 C102 312 104 340 104 370 C106 374 114 374 120 372 C124 348 122 320 118 288 Z';

const M_TORSO =
  'M70 98 C60 124 56 160 64 198 C56 226 52 250 60 272 C68 292 84 302 100 304 C116 302 132 292 140 272 C148 250 144 226 136 198 C144 160 140 124 130 98 C122 88 78 88 70 98 Z';
const M_ARM_L = 'M68 108 C48 130 40 172 48 204 C52 220 64 222 70 206 C74 184 76 148 74 122 Z';
const M_ARM_R = 'M132 108 C152 130 160 172 152 204 C148 220 136 222 130 206 C126 184 124 148 126 122 Z';
const M_LEGS =
  'M80 300 C76 330 74 352 78 372 C84 374 94 374 96 370 C96 338 98 318 100 304 C102 318 104 338 104 370 C106 374 116 374 122 372 C126 352 124 330 120 300 Z';

function Eye({ cx, cy, uid, scale = 1 }: { cx: number; cy: number; uid: string; scale?: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={4.4 * scale} ry={4.1 * scale} fill="#fff7fb" />
      <circle cx={cx} cy={cy + 0.2} r={3.1 * scale} fill={`url(#cs-iris-${uid})`} />
      <circle cx={cx} cy={cy + 0.2} r={1.5 * scale} fill="#1d0b2c" />
      <circle cx={cx + 1.1 * scale} cy={cy - 1.1 * scale} r={1 * scale} fill="#fff" />
      <path
        d={`M${cx - 5 * scale} ${cy - 1.2 * scale} Q${cx} ${cy - 5.6 * scale} ${cx + 5 * scale} ${cy - 1.2 * scale}`}
        fill="none"
        stroke="#3b1d4a"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Layered paper-doll SVG.
 * Groups: female-base / male-base, female-breast-{size}, male-penis-{size}.
 */
export function CharacterSprite({
  appearance,
  size = 'medium',
  className,
  label,
}: CharacterSpriteProps) {
  const uid = useId().replace(/:/g, '');
  const gender = appearance?.gender ?? null;
  const layers = appearance ? resolveSpriteLayers(appearance) : [];
  const layerIds = new Set(layers.map((layer) => layer.spriteId));
  const show = (spriteId: string) => (layerIds.has(spriteId) ? 'visible' : 'hidden');
  const caption =
    label ??
    (gender ? `Stylized ${gender} paper-doll character` : 'Character preview');

  const skin = `url(#cs-skin-${uid})`;
  const shade = `url(#cs-shade-${uid})`;
  const limb = {
    stroke: INK,
    strokeWidth: INK_W,
    strokeLinejoin: 'round' as const,
  };

  return (
    <div
      className={['character-sprite', SIZE_CLASS[size], className]
        .filter(Boolean)
        .join(' ')}
    >
      <svg
        className="character-sprite__svg"
        viewBox="0 0 200 400"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={caption}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`cs-skin-${uid}`} x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0%" stopColor="#fddccf" />
            <stop offset="55%" stopColor="#f4c1af" />
            <stop offset="100%" stopColor="#e7a692" />
          </linearGradient>
          <linearGradient id={`cs-shade-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8a3d62" stopOpacity="0.26" />
            <stop offset="30%" stopColor="#8a3d62" stopOpacity="0" />
            <stop offset="70%" stopColor="#8a3d62" stopOpacity="0" />
            <stop offset="100%" stopColor="#8a3d62" stopOpacity="0.26" />
          </linearGradient>
          <linearGradient id={`cs-hair-f-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f5b8fd" />
            <stop offset="52%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id={`cs-hair-m-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7a4a8c" />
            <stop offset="100%" stopColor="#2a163a" />
          </linearGradient>
          <linearGradient id={`cs-hair-sheen-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`cs-blush-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff4fbf" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ff4fbf" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`cs-iris-${uid}`} cx="40%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#d8b4fe" />
            <stop offset="100%" stopColor="#6d28d9" />
          </radialGradient>
          <linearGradient id={`cs-lip-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0809e" />
            <stop offset="100%" stopColor="#c8486a" />
          </linearGradient>
          <linearGradient id={`cs-gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe9a6" />
            <stop offset="100%" stopColor="#e0a92c" />
          </linearGradient>
          <radialGradient id={`cs-ground-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2a163a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#2a163a" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="100" cy="376" rx="52" ry="9" fill={`url(#cs-ground-${uid})`} />

        {gender === 'female' && (
          <>
            <g id="female-base">
              <path d={F_HAIR_BACK} fill={`url(#cs-hair-f-${uid})`} />
              <path d={F_HAIR_BACK} fill={`url(#cs-hair-sheen-${uid})`} opacity="0.55" />
              <path d={F_TORSO} fill={skin} {...limb} />
              <path d={F_TORSO} fill={shade} />
              <path d={F_ARM_L} fill={skin} {...limb} />
              <path d={F_ARM_L} fill={shade} />
              <path d={F_ARM_R} fill={skin} {...limb} />
              <path d={F_ARM_R} fill={shade} />
              <path d={F_LEGS} fill={skin} {...limb} />
              <path d={F_LEGS} fill={shade} />
              <ellipse cx="88" cy="372" rx="10" ry="4.5" fill="#e6a08e" {...limb} strokeWidth="1" />
              <ellipse cx="112" cy="372" rx="10" ry="4.5" fill="#e6a08e" {...limb} strokeWidth="1" />
              <rect x="94" y="76" width="12" height="20" rx="4.5" fill={skin} {...limb} strokeWidth="1" />
              <circle cx="100" cy="52" r="28" fill={skin} {...limb} />
              <path
                d="M72 48 C74 18 90 8 100 10 C110 8 126 18 128 48 C132 34 128 20 118 14 C110 8 90 8 82 14 C72 20 68 34 72 48 Z"
                fill={`url(#cs-hair-f-${uid})`}
              />
              <path
                d="M73 46 C79 31 90 27 100 29 C110 27 121 31 127 46 C119 38 110 35 100 37 C90 35 81 38 73 46 Z"
                fill={`url(#cs-hair-f-${uid})`}
                stroke="#a855f7"
                strokeWidth="0.6"
                strokeOpacity="0.6"
              />
              <path
                d="M82 24 C90 18 104 17 114 22"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.38"
              />
              <circle cx="90" cy="57" r="7" fill={`url(#cs-blush-${uid})`} />
              <circle cx="110" cy="57" r="7" fill={`url(#cs-blush-${uid})`} />
              <Eye cx={90} cy={50} uid={uid} />
              <Eye cx={110} cy={50} uid={uid} />
              <path
                d="M84 41 Q90 38.5 96 40.5 M104 40.5 Q110 38.5 116 41"
                fill="none"
                stroke="#6b3d7a"
                strokeWidth="1.1"
                strokeLinecap="round"
                opacity="0.75"
              />
              <path d="M100 55 Q99 58 101 58.4" fill="none" stroke="#c98a7a" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
              <path
                d="M94.5 63 Q97 61.6 100 62.8 Q103 61.6 105.5 63 Q100 68.2 94.5 63 Z"
                fill={`url(#cs-lip-${uid})`}
              />
              <circle cx="124" cy="58" r="2.4" fill={`url(#cs-gold-${uid})`} stroke="#b57a1a" strokeWidth="0.5" />
            </g>

            <g id="female-breast-small" visibility={show('female-breast-small')}>
              <ellipse cx="88" cy="128" rx="11" ry="9" fill={skin} {...limb} />
              <ellipse cx="112" cy="128" rx="11" ry="9" fill={skin} {...limb} />
              <ellipse cx="86" cy="125.5" rx="4" ry="2.6" fill="#fff" opacity="0.22" />
              <ellipse cx="110" cy="125.5" rx="4" ry="2.6" fill="#fff" opacity="0.22" />
              <circle cx="89" cy="130" r="2.1" fill="#d46a88" />
              <circle cx="113" cy="130" r="2.1" fill="#d46a88" />
            </g>
            <g id="female-breast-medium" visibility={show('female-breast-medium')}>
              <ellipse cx="86" cy="130" rx="16" ry="13" fill={skin} {...limb} />
              <ellipse cx="114" cy="130" rx="16" ry="13" fill={skin} {...limb} />
              <ellipse cx="82" cy="125" rx="6" ry="3.6" fill="#fff" opacity="0.22" />
              <ellipse cx="110" cy="125" rx="6" ry="3.6" fill="#fff" opacity="0.22" />
              <circle cx="88" cy="133" r="2.6" fill="#d46a88" />
              <circle cx="116" cy="133" r="2.6" fill="#d46a88" />
            </g>
            <g id="female-breast-large" visibility={show('female-breast-large')}>
              <ellipse cx="84" cy="134" rx="21" ry="17" fill={skin} {...limb} />
              <ellipse cx="116" cy="134" rx="21" ry="17" fill={skin} {...limb} />
              <ellipse cx="78" cy="127" rx="8" ry="4.6" fill="#fff" opacity="0.22" />
              <ellipse cx="108" cy="127" rx="8" ry="4.6" fill="#fff" opacity="0.22" />
              <circle cx="86" cy="138" r="3.1" fill="#d46a88" />
              <circle cx="118" cy="138" r="3.1" fill="#d46a88" />
            </g>
          </>
        )}

        {gender === 'male' && (
          <>
            <g id="male-base">
              <path d={M_TORSO} fill={skin} {...limb} />
              <path d={M_TORSO} fill={shade} />
              <path d={M_ARM_L} fill={skin} {...limb} />
              <path d={M_ARM_L} fill={shade} />
              <path d={M_ARM_R} fill={skin} {...limb} />
              <path d={M_ARM_R} fill={shade} />
              <path d={M_LEGS} fill={skin} {...limb} />
              <path d={M_LEGS} fill={shade} />
              <ellipse cx="88" cy="372" rx="11" ry="4.5" fill="#e6a08e" {...limb} strokeWidth="1" />
              <ellipse cx="112" cy="372" rx="11" ry="4.5" fill="#e6a08e" {...limb} strokeWidth="1" />
              <rect x="93" y="76" width="14" height="20" rx="4.5" fill={skin} {...limb} strokeWidth="1" />
              <circle cx="100" cy="50" r="30" fill={skin} {...limb} />
              <path
                d="M70 48 C72 16 88 6 100 8 C112 6 128 16 130 48 C128 28 118 18 100 18 C82 18 72 28 70 48 Z"
                fill={`url(#cs-hair-m-${uid})`}
              />
              <path
                d="M80 20 C90 13 106 13 118 20"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.22"
              />
              <Eye cx={89} cy={48} uid={uid} scale={0.95} />
              <Eye cx={111} cy={48} uid={uid} scale={0.95} />
              <path
                d="M82 39 Q89 36 96 38.5 M104 38.5 Q111 36 118 39"
                fill="none"
                stroke="#3b1d4a"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.8"
              />
              <path d="M100 53 Q99 57 101.5 57.6" fill="none" stroke="#c98a7a" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
              <path d="M94 63 Q100 66 106 63" fill="none" stroke="#b45a72" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M82 118 Q100 126 118 118" fill="none" stroke="#d88978" strokeWidth="1.1" opacity="0.5" />
              <rect x="96" y="88" width="8" height="3" rx="1" fill={`url(#cs-gold-${uid})`} opacity="0.85" />
            </g>

            <g id="male-penis-small" visibility={show('male-penis-small')}>
              <ellipse cx="94" cy="300" rx="6" ry="5" fill={skin} {...limb} strokeWidth="1.1" />
              <ellipse cx="106" cy="300" rx="6" ry="5" fill={skin} {...limb} strokeWidth="1.1" />
              <path d="M97 298 Q100 312 103 298" fill={skin} {...limb} strokeWidth="1.1" />
              <ellipse cx="100" cy="311" rx="3.2" ry="2.4" fill="#e09a88" />
            </g>
            <g id="male-penis-medium" visibility={show('male-penis-medium')}>
              <ellipse cx="93" cy="301" rx="7" ry="5.5" fill={skin} {...limb} strokeWidth="1.1" />
              <ellipse cx="107" cy="301" rx="7" ry="5.5" fill={skin} {...limb} strokeWidth="1.1" />
              <path d="M96 298 Q100 322 104 298" fill={skin} {...limb} strokeWidth="1.1" />
              <ellipse cx="100" cy="321" rx="3.6" ry="2.7" fill="#e09a88" />
            </g>
            <g id="male-penis-large" visibility={show('male-penis-large')}>
              <ellipse cx="92" cy="302" rx="8" ry="6" fill={skin} {...limb} strokeWidth="1.1" />
              <ellipse cx="108" cy="302" rx="8" ry="6" fill={skin} {...limb} strokeWidth="1.1" />
              <path d="M95 298 Q100 334 105 298" fill={skin} {...limb} strokeWidth="1.1" />
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
      </svg>
    </div>
  );
}
