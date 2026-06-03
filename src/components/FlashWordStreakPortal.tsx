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

function buildToastStyle(
  rect: DOMRect,
  placement: StreakToastPlacement,
): CSSProperties {
  const centerY = rect.top + rect.height / 2;
  const base: CSSProperties = {
    position: 'fixed',
    top: centerY,
    transform: 'translateY(-50%)',
    zIndex: PORTAL_Z_INDEX,
    pointerEvents: 'none',
  };

  if (placement === 'left') {
    return {
      ...base,
      right: window.innerWidth - rect.left + GAP_PX,
      maxWidth: Math.max(140, rect.left - GAP_PX - 16),
    };
  }

  return {
    ...base,
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
