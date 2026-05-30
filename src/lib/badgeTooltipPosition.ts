import type { CSSProperties } from 'react';

const GAP_PX = 9;
const EDGE_PAD = 12;
const ARROW_EDGE_PAD = 14;
const MAX_WIDTH_REM = 36;

type SafeBounds = { left: number; top: number; right: number; bottom: number };

export type TooltipPlacement = 'above' | 'below';

let safeAreaProbe: HTMLDivElement | null = null;

function getSafeBounds(): SafeBounds {
  if (typeof document === 'undefined') {
    return { left: EDGE_PAD, top: EDGE_PAD, right: EDGE_PAD, bottom: EDGE_PAD };
  }

  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;padding:' +
      'env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
    document.body.appendChild(safeAreaProbe);
  }

  const s = getComputedStyle(safeAreaProbe);
  const parse = (v: string) => parseFloat(v) || 0;
  const vv = window.visualViewport;
  const vvLeft = vv?.offsetLeft ?? 0;
  const vvTop = vv?.offsetTop ?? 0;
  const vvWidth = vv?.width ?? window.innerWidth;
  const vvHeight = vv?.height ?? window.innerHeight;

  return {
    left: Math.max(EDGE_PAD, parse(s.paddingLeft)) + vvLeft,
    top: Math.max(EDGE_PAD, parse(s.paddingTop)) + vvTop,
    right:
      Math.max(EDGE_PAD, parse(s.paddingRight)) +
      (window.innerWidth - vvLeft - vvWidth),
    bottom:
      Math.max(EDGE_PAD, parse(s.paddingBottom)) +
      (window.innerHeight - vvTop - vvHeight),
  };
}

function measureTooltip(
  tooltip: HTMLElement,
  maxWidthPx: number,
): DOMRect {
  tooltip.classList.add('badge-tooltip--measuring');
  tooltip.style.maxWidth = `${maxWidthPx}px`;
  const rect = tooltip.getBoundingClientRect();
  tooltip.style.maxWidth = '';
  tooltip.classList.remove('badge-tooltip--measuring');
  return rect;
}

export function measureAndClampBadgeTooltip(
  anchor: HTMLElement,
  tooltip: HTMLElement,
): { style: CSSProperties; placement: TooltipPlacement } | null {
  const anchorRect = anchor.getBoundingClientRect();
  const safe = getSafeBounds();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availableWidth = vw - safe.left - safe.right;
  const rootFontSize =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const maxWidthPx = Math.min(availableWidth, MAX_WIDTH_REM * rootFontSize);

  const tipRect = measureTooltip(tooltip, maxWidthPx);
  if (tipRect.width <= 0 || tipRect.height <= 0) return null;

  const maxLeft = vw - safe.right - tipRect.width;
  let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
  left = Math.max(safe.left, Math.min(left, maxLeft));

  let top = anchorRect.top - tipRect.height - GAP_PX;
  let placement: TooltipPlacement = 'above';

  if (top < safe.top) {
    const belowTop = anchorRect.bottom + GAP_PX;
    if (belowTop + tipRect.height <= vh - safe.bottom) {
      top = belowTop;
      placement = 'below';
    } else {
      top = Math.max(
        safe.top,
        Math.min(top, vh - safe.bottom - tipRect.height),
      );
    }
  }

  const badgeCenterX = anchorRect.left + anchorRect.width / 2;
  const arrowLeft = Math.max(
    ARROW_EDGE_PAD,
    Math.min(badgeCenterX - left, tipRect.width - ARROW_EDGE_PAD),
  );

  return {
    placement,
    style: {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      bottom: 'auto',
      transform: 'none',
      maxWidth: `${maxWidthPx}px`,
      ['--tooltip-arrow-left' as string]: `${arrowLeft}px`,
    },
  };
}
