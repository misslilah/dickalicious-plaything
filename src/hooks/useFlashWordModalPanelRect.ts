import { useCallback, useEffect, useState, type RefObject } from 'react';

const PANEL_SELECTOR = '.flash-word-game-modal__panel';

export function useFlashWordModalPanelRect(
  anchorRef: RefObject<HTMLElement | null>,
  active: boolean,
) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const update = useCallback(() => {
    const panel = anchorRef.current?.closest(PANEL_SELECTOR) as HTMLElement | null;
    if (!panel) {
      setRect(null);
      return;
    }
    setRect(panel.getBoundingClientRect());
  }, [anchorRef]);

  useEffect(() => {
    if (!active) {
      setRect(null);
      return undefined;
    }

    update();
    const panel = anchorRef.current?.closest(PANEL_SELECTOR) as HTMLElement | null;
    if (!panel) return undefined;

    const observer = new ResizeObserver(update);
    observer.observe(panel);

    const onLayout = () => update();
    window.addEventListener('resize', onLayout);
    window.visualViewport?.addEventListener('resize', onLayout);
    window.visualViewport?.addEventListener('scroll', onLayout);
    window.addEventListener('scroll', onLayout, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onLayout);
      window.visualViewport?.removeEventListener('resize', onLayout);
      window.visualViewport?.removeEventListener('scroll', onLayout);
      window.removeEventListener('scroll', onLayout, true);
    };
  }, [active, anchorRef, update]);

  useEffect(() => {
    if (!active) return undefined;
    const frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [active, update]);

  return rect;
}
