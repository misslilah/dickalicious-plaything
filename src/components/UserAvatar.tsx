import { useId, useRef, type ReactNode } from 'react';
import {
  getAvatarFrame,
  type AvatarFrameId,
} from '../lib/avatarFrames';

export type UserAvatarSize = 'sm' | 'md' | 'lg';

function initialFrom(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
}

function HaloFx({ uid }: { uid: string }) {
  return (
    <svg
      className="user-avatar__fx user-avatar__fx--back"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <defs>
        <filter id={`${uid}-halo`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`${uid}-halo-stroke`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff4c4" />
          <stop offset="45%" stopColor="#f5c84c" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <ellipse
        className="user-avatar__halo"
        cx="50"
        cy="46"
        rx="34"
        ry="20"
        fill="none"
        stroke={`url(#${uid}-halo-stroke)`}
        strokeWidth="2.4"
        filter={`url(#${uid}-halo)`}
      />
      <ellipse
        cx="50"
        cy="46"
        rx="28"
        ry="15"
        fill="none"
        stroke="rgba(255, 244, 196, 0.35)"
        strokeWidth="0.8"
      />
    </svg>
  );
}

function CrownFx() {
  return (
    <svg
      className="user-avatar__fx user-avatar__fx--front"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <g className="user-avatar__crown">
        <path
          d="M28 22 L34 34 L42 18 L50 32 L58 18 L66 34 L72 22 L70 38 H30 Z"
          fill="#f5c84c"
          stroke="#7c4a03"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M31 38 H69 L67 42 H33 Z"
          fill="#d4a017"
          stroke="#7c4a03"
          strokeWidth="0.8"
        />
        <circle cx="42" cy="24" r="2.1" fill="#fb7185" />
        <circle cx="50" cy="20" r="2.4" fill="#fda4af" />
        <circle cx="58" cy="24" r="2.1" fill="#fb7185" />
      </g>
    </svg>
  );
}

function MercuryFx({ uid }: { uid: string }) {
  return (
    <svg
      className="user-avatar__fx user-avatar__fx--front"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <defs>
        <filter id={`${uid}-goo`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
            result="goo"
          />
          <feBlend in="SourceGraphic" in2="goo" />
        </filter>
      </defs>
      <g filter={`url(#${uid}-goo)`} fill="none">
        <circle
          className="user-avatar__mercury-ring"
          cx="50"
          cy="50"
          r="34"
          stroke="#f8fafc"
          strokeWidth="3.2"
        />
        <g className="user-avatar__mercury-orbit">
          <circle cx="50" cy="16" r="4.2" fill="#ffffff" />
          <circle cx="80" cy="62" r="3.2" fill="#e2e8f0" />
          <circle cx="22" cy="68" r="2.6" fill="#f1f5f9" />
        </g>
      </g>
    </svg>
  );
}

function FlameFx() {
  const tongues = [
    { d: 'M50 86 C46 74 42 66 50 54 C58 66 54 74 50 86 Z', delay: '0s' },
    { d: 'M34 80 C28 68 26 60 36 50 C42 62 40 72 34 80 Z', delay: '0.18s' },
    { d: 'M66 80 C72 68 74 60 64 50 C58 62 60 72 66 80 Z', delay: '0.12s' },
    { d: 'M22 70 C16 60 18 52 28 46 C30 58 26 66 22 70 Z', delay: '0.28s' },
    { d: 'M78 70 C84 60 82 52 72 46 C70 58 74 66 78 70 Z', delay: '0.22s' },
    { d: 'M42 84 C38 72 40 62 46 56 C50 68 46 78 42 84 Z', delay: '0.08s' },
    { d: 'M58 84 C62 72 60 62 54 56 C50 68 54 78 58 84 Z', delay: '0.32s' },
  ];
  return (
    <svg
      className="user-avatar__fx user-avatar__fx--front"
      viewBox="0 0 100 100"
      aria-hidden
    >
      {tongues.map((tongue, index) => (
        <path
          key={index}
          className="user-avatar__flame"
          d={tongue.d}
          fill={index % 2 === 0 ? '#f97316' : '#facc15'}
          style={{ animationDelay: tongue.delay }}
        />
      ))}
      <path
        className="user-avatar__flame user-avatar__flame--core"
        d="M50 82 C47 72 45 64 50 58 C55 64 53 72 50 82 Z"
        fill="#fff7ed"
      />
    </svg>
  );
}

function NeonFx() {
  return (
    <svg
      className="user-avatar__fx user-avatar__fx--front"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <circle
        className="user-avatar__neon user-avatar__neon--cyan"
        cx="50"
        cy="50"
        r="35.5"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.6"
      />
      <circle
        className="user-avatar__neon user-avatar__neon--pink"
        cx="50"
        cy="50"
        r="33"
        fill="none"
        stroke="#e879f9"
        strokeWidth="2.1"
      />
    </svg>
  );
}

function ThornsFx() {
  const spikes: ReactNode[] = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const inner = 33;
    const outer = 41;
    const tx = 50 + Math.cos(angle) * outer;
    const ty = 50 + Math.sin(angle) * outer;
    const left = angle - 0.16;
    const right = angle + 0.16;
    const lx = 50 + Math.cos(left) * (inner - 1);
    const ly = 50 + Math.sin(left) * (inner - 1);
    const rx = 50 + Math.cos(right) * (inner - 1);
    const ry = 50 + Math.sin(right) * (inner - 1);
    spikes.push(
      <path
        key={i}
        d={`M${lx.toFixed(1)} ${ly.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${rx.toFixed(1)} ${ry.toFixed(1)} Z`}
        fill={i % 2 === 0 ? '#14532d' : '#166534'}
        stroke="#052e16"
        strokeWidth="0.6"
      />,
    );
  }
  return (
    <svg
      className="user-avatar__fx user-avatar__fx--front"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <circle
        cx="50"
        cy="50"
        r="33.5"
        fill="none"
        stroke="#14532d"
        strokeWidth="2.4"
      />
      {spikes}
    </svg>
  );
}

function FrameLayers({
  frame,
  uid,
}: {
  frame: AvatarFrameId;
  uid: string;
}) {
  if (frame === 'none') return null;
  return (
    <>
      {frame === 'halo' ? <HaloFx uid={uid} /> : null}
      {frame === 'crown' ? <CrownFx /> : null}
      {frame === 'mercury' ? <MercuryFx uid={uid} /> : null}
      {frame === 'flame' ? <FlameFx /> : null}
      {frame === 'neon' ? <NeonFx /> : null}
      {frame === 'thorns' ? <ThornsFx /> : null}
    </>
  );
}

export function UserAvatar({
  url,
  name,
  frameId,
  size = 'md',
  editable = false,
  uploading = false,
  onPick,
}: {
  url: string | null;
  name: string;
  frameId?: string | null;
  size?: UserAvatarSize;
  editable?: boolean;
  uploading?: boolean;
  onPick?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId().replace(/:/g, '');
  const frame = getAvatarFrame(frameId).id;
  const initial = initialFrom(name);

  const inner = url ? (
    <img src={url} alt="" className="profile-avatar__img" />
  ) : (
    <span className="profile-avatar__fallback" aria-hidden>
      {initial}
    </span>
  );

  const face = editable && onPick ? (
    <button
      type="button"
      className="user-avatar__face profile-avatar profile-avatar--edit"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      aria-label="Change profile picture"
    >
      {inner}
      <span className="profile-avatar__camera" aria-hidden>
        {uploading ? '…' : '📷'}
      </span>
    </button>
  ) : (
    <div className="user-avatar__face profile-avatar" aria-hidden={!url}>
      {inner}
    </div>
  );

  return (
    <div
      className={`user-avatar user-avatar--${size} user-avatar--${frame}`}
      data-frame={frame}
    >
      {editable && onPick ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPick(file);
          }}
        />
      ) : null}
      <FrameLayers frame={frame} uid={uid} />
      {face}
    </div>
  );
}
