import type { CSSProperties, ReactNode } from 'react';
import {
  COSMETIC_RARITY_LABEL,
  type CosmeticRarity,
} from '../lib/cosmeticRarity';
import '../cosmetics.css';

export type TileStatus =
  | 'buy'
  | 'equip'
  | 'owned'
  | 'equipped'
  | 'buying';

export function RarityChip({
  rarity,
  className,
}: {
  rarity: CosmeticRarity;
  className?: string;
}) {
  return (
    <span
      className={['cos-chip cos-chip--rarity', `cos-rarity-${rarity}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="cos-chip__gem" aria-hidden />
      {COSMETIC_RARITY_LABEL[rarity]}
    </span>
  );
}

export function ShopEmpty({
  icon = '✨',
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="shop-empty" role="status">
      <span className="shop-empty__icon" aria-hidden>
        {icon}
      </span>
      <h4 className="shop-empty__title">{title}</h4>
      {children ? <p className="muted shop-empty__text">{children}</p> : null}
    </div>
  );
}

export function ShopSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="shop-skeleton-grid" aria-busy="true" aria-label="Loading shop">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="shop-skeleton" />
      ))}
    </div>
  );
}

export interface ShopTileProps {
  rarity: CosmeticRarity;
  size?: 'standard' | 'featured';
  name: string;
  subtitle?: ReactNode;
  priceLabel: string;
  artStyle?: CSSProperties;
  icon?: string;
  /** Framed preview (avatar contours): keeps the art overflow visible. */
  preview?: ReactNode;
  ribbon?: string;
  status: TileStatus;
  disabled?: boolean;
  onAction?: () => void;
}

/** Item-shop card shared by banners, frames, videos and rewards. */
export function ShopTile({
  rarity,
  size = 'standard',
  name,
  subtitle,
  priceLabel,
  artStyle,
  icon,
  preview,
  ribbon,
  status,
  disabled,
  onAction,
}: ShopTileProps) {
  const cta =
    status === 'buying'
      ? 'Buying…'
      : status === 'equip'
        ? 'Equip'
        : status === 'owned'
          ? 'Owned'
          : status === 'equipped'
            ? 'Equipped'
            : 'BUY';
  const actionable = status === 'buy' || status === 'equip' || status === 'buying';
  const isFree = priceLabel === 'Free';

  const classes = [
    'item-shop-tile',
    `item-shop-tile--${rarity}`,
    `cos-rarity-${rarity}`,
    size === 'featured' ? 'item-shop-tile--featured' : '',
    status === 'equipped' ? 'item-shop-tile--equipped' : '',
    preview ? 'item-shop-tile--framed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const artClasses = [
    'item-shop-tile__art',
    preview ? 'item-shop-tile__art--framed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes}>
      <div className={artClasses} style={artStyle}>
        <RarityChip rarity={rarity} className="item-shop-tile__rarity" />
        {ribbon ? <span className="item-shop-tile__ribbon">{ribbon}</span> : null}
        {preview ? (
          <div className="item-shop-tile__preview">{preview}</div>
        ) : icon ? (
          <span className="item-shop-tile__icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        {status === 'equipped' ? (
          <span className="cos-chip cos-chip--state item-shop-tile__state">
            ✓ Equipped
          </span>
        ) : status === 'owned' ? (
          <span className="cos-chip cos-chip--owned item-shop-tile__state">
            ✓ Owned
          </span>
        ) : null}
      </div>
      <div className="item-shop-tile__body">
        <strong className="item-shop-tile__name">{name}</strong>
        {subtitle ? <p className="item-shop-tile__sub">{subtitle}</p> : null}
      </div>
      <div className="item-shop-tile__bar">
        <span
          className={`item-shop-tile__price${isFree ? ' item-shop-tile__price--free' : ''}`}
        >
          {isFree ? null : (
            <span className="item-shop-tile__gem" aria-hidden>
              ◆
            </span>
          )}
          {priceLabel}
        </span>
        <span className="item-shop-tile__actions">
          {actionable ? (
            <button
              type="button"
              className="btn btn--primary btn--small item-shop-tile__buy"
              disabled={disabled || status === 'buying'}
              onClick={onAction}
            >
              {cta}
            </button>
          ) : null}
        </span>
      </div>
    </article>
  );
}
