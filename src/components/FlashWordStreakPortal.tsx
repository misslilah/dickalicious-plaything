import { useMemo, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFlashWordModalPanelRect } from '../hooks/useFlashWordModalPanelRect';

export type StreakToastPlacement = 'left' | 'right';

export interface FlashWordStreakToast {
  message: string;
  placement: StreakToastPlacement;
}

const GAP_PX = 12;
const PORTAL_Z_INDEX = 221;

interface FlashWordStreakPortalProps {
  toast: FlashWordStreakToast | null;
  anchorRef: RefObject<HTMLElement | null>;
}

function hasSideSpaceForToast(rect: DOMRect): boolean {
  const minSidePx = 72;
  return (
    window.innerWidth > 640 &&
    rect.left >= minSidePx &&
    window.innerWidth - rect.right >= minSidePx
  );
}

function buildToastStyle(
  rect: DOMRect,
  placement: StreakToastPlacement,
): CSSProperties {
  const base: CSSProperties = {
    position: 'fixed',
    zIndex: PORTAL_Z_INDEX,
    pointerEvents: 'none',
  };

  if (!hasSideSpaceForToast(rect)) {
    return {
      ...base,
      left: '50%',
      top: Math.max(8, rect.top - GAP_PX),
      transform: 'translate(-50%, -100%)',
      maxWidth: `min(calc(100vw - 1.5rem), ${Math.max(160, rect.width)}px)`,
      textAlign: 'center',
    };
  }

  const centerY = rect.top + rect.height / 2;
  const sideBase: CSSProperties = {
    ...base,
    top: centerY,
    transform: 'translateY(-50%)',
  };

  if (placement === 'left') {
    return {
      ...sideBase,
      right: window.innerWidth - rect.left + GAP_PX,
      maxWidth: Math.max(140, rect.left - GAP_PX - 16),
    };
  }

  return {
    ...sideBase,
    left: rect.right + GAP_PX,
    maxWidth: Math.max(140, window.innerWidth - rect.right - GAP_PX - 16),
  };
}

export function FlashWordStreakPortal({
  toast,
  anchorRef,
}: FlashWordStreakPortalProps) {
  const active = toast != null;
  const panelRect = useFlashWordModalPanelRect(anchorRef, active);

  const style = useMemo(() => {
    if (!toast || !panelRect) return null;
    return buildToastStyle(panelRect, toast.placement);
  }, [toast, panelRect]);

  if (!toast || !style) return null;

  const className = [
    'flash-word-streak-portal',
    'flash-word-streak-toast',
    `flash-word-streak-toast--${toast.placement}`,
  ].join(' ');

  return createPortal(
    <p className={className} style={style} aria-live="polite">
      {toast.message}
    </p>,
    document.body,
  );
}
