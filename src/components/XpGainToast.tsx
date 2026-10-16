import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

const AUTO_DISMISS_MS = 1400;
const SPARK_COUNT = 12;
const BURST_Z_INDEX = 180;

export interface XpGainBurst {
  id: number;
  amount: number;
}

interface XpGainToastProps {
  burst: XpGainBurst | null;
  onDismiss: () => void;
}

function isBarVisible(rect: DOMRect): boolean {
  return (
    rect.width > 8 &&
    rect.height > 8 &&
    rect.bottom > 8 &&
    rect.top < window.innerHeight - 8
  );
}

function computeBurstStyle(): CSSProperties {
  const bar = document.querySelector<HTMLElement>('[data-xp-bar]');
  const rect = bar?.getBoundingClientRect();
  if (rect && isBarVisible(rect)) {
    return {
      position: 'fixed',
      left: rect.left + rect.width / 2,
      top: Math.max(36, rect.top + rect.height / 2),
      transform: 'translate(-50%, -50%)',
      zIndex: BURST_Z_INDEX,
      pointerEvents: 'none',
    };
  }

  return {
    position: 'fixed',
    left: '50%',
    top: '38%',
    transform: 'translate(-50%, -50%)',
    zIndex: BURST_Z_INDEX,
    pointerEvents: 'none',
  };
}

export function XpGainToast({ burst, onDismiss }: XpGainToastProps) {
  const [style, setStyle] = useState<CSSProperties>(computeBurstStyle);

  useEffect(() => {
    if (burst == null) return;
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [burst, onDismiss]);

  useLayoutEffect(() => {
    if (burst == null) return;
    const update = () => setStyle(computeBurstStyle());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [burst]);

  if (burst == null || typeof document === 'undefined') return null;

  return createPortal(
    <div
      key={burst.id}
      className="xp-gain-burst"
      style={style}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="xp-gain-burst__ring" aria-hidden />
      <p className="xp-gain-burst__text">+{burst.amount} XP</p>
      {Array.from({ length: SPARK_COUNT }, (_, i) => (
        <span
          key={i}
          className="xp-gain-burst__spark"
          style={{ '--i': i } as CSSProperties}
          aria-hidden
        />
      ))}
    </div>,
    document.body,
  );
}
