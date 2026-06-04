import type { CSSProperties } from 'react';
import type { FlashWordZone } from './flashWordGames';

export interface ImageContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Pixel rect of visible image content inside a container using
 * object-fit: contain and object-position: center.
 */
export function getImageContentRect(
  img: HTMLImageElement,
  container: HTMLElement,
): ImageContentRect | null {
  const containerRect = container.getBoundingClientRect();
  const cw = containerRect.width;
  const ch = containerRect.height;
  if (cw <= 0 || ch <= 0) return null;

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw <= 0 || nh <= 0) return null;

  const imageAspect = nw / nh;
  const containerAspect = cw / ch;

  let renderWidth: number;
  let renderHeight: number;

  if (imageAspect > containerAspect) {
    renderWidth = cw;
    renderHeight = cw / imageAspect;
  } else {
    renderHeight = ch;
    renderWidth = ch * imageAspect;
  }

  return {
    left: (cw - renderWidth) / 2,
    top: (ch - renderHeight) / 2,
    width: renderWidth,
    height: renderHeight,
  };
}

export function contentRectToOverlayStyle(
  rect: ImageContentRect,
  containerWidth: number,
  containerHeight: number,
): CSSProperties {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { left: 0, top: 0, width: '100%', height: '100%' };
  }
  return {
    left: `${(rect.left / containerWidth) * 100}%`,
    top: `${(rect.top / containerHeight) * 100}%`,
    width: `${(rect.width / containerWidth) * 100}%`,
    height: `${(rect.height / containerHeight) * 100}%`,
  };
}

export function flashWordZoneStyle(zone: FlashWordZone): CSSProperties {
  return {
    left: `${zone.xPct}%`,
    top: `${zone.yPct}%`,
    width: `${zone.widthPct}%`,
    height: `${zone.heightPct}%`,
  };
}
