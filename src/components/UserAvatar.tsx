import { useId, useRef } from 'react';
import { getAvatarFrame } from '../lib/avatarFrames';
import { AvatarContourFx, type ContourDetail } from './AvatarContourFx';
import '../avatarContours.css';

/**
 * xs / sm (≈24–38px) get a simplified, static contour so lists and chat stay
 * fast; md / lg (≥ 70px) get the full art and the rarity animations.
 */
export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const DETAIL: Record<UserAvatarSize, ContourDetail> = {
  xs: { fine: false, animated: false },
  sm: { fine: false, animated: false },
  md: { fine: true, animated: true },
  lg: { fine: true, animated: true },
};

function initialFrom(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
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
  // Unique per instance so SVG gradient ids never collide between avatars.
  const uid = `uac${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const def = getAvatarFrame(frameId);
  const frame = def.id;
  const detail = DETAIL[size];
  const initial = initialFrom(name);

  const inner = url ? (
    <img src={url} alt="" className="profile-avatar__img" />
  ) : (
    <span className="profile-avatar__fallback" aria-hidden>
      {initial}
    </span>
  );

  const face =
    editable && onPick ? (
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

  const classes = [
    'user-avatar',
    `user-avatar--${size}`,
    `user-avatar--${frame}`,
    frame !== 'none' ? `user-avatar--framed uac-rarity-${def.rarity}` : '',
    frame !== 'none' && detail.animated ? 'user-avatar--animated' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} data-frame={frame}>
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
      {frame !== 'none' ? (
        <AvatarContourFx frame={frame} uid={uid} detail={detail} />
      ) : null}
      {face}
    </div>
  );
}
