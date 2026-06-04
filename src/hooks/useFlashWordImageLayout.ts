import {
  useCallback,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  contentRectToOverlayStyle,
  getImageContentRect,
} from '../lib/flashWordZonePosition';

const DEFAULT_OVERLAY_STYLE: CSSProperties = {
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
};

export function useFlashWordImageLayout(
  containerRef: RefObject<HTMLElement | null>,
  imageRef: RefObject<HTMLImageElement | null>,
  imageSrc?: string,
): CSSProperties {
  const [overlayStyle, setOverlayStyle] = useState<CSSProperties>(DEFAULT_OVERLAY_STYLE);

  const update = useCallback(() => {
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img) return;

    const contentRect = getImageContentRect(img, container);
    if (!contentRect) return;

    const containerRect = container.getBoundingClientRect();
    setOverlayStyle(
      contentRectToOverlayStyle(
        contentRect,
        containerRect.width,
        containerRect.height,
      ),
    );
  }, [containerRef, imageRef]);

  useLayoutEffect(() => {
    let ro: ResizeObserver | null = null;
    let observedImg: HTMLImageElement | null = null;
    let rafId = 0;

    const attach = (): boolean => {
      const container = containerRef.current;
      const img = imageRef.current;
      if (!container || !img) return false;

      update();
      ro?.disconnect();
      ro = new ResizeObserver(update);
      ro.observe(container);

      if (observedImg !== img) {
        observedImg?.removeEventListener('load', update);
        img.addEventListener('load', update);
        observedImg = img;
      }
      return true;
    };

    if (!attach()) {
      rafId = requestAnimationFrame(() => attach());
    }

    window.addEventListener('resize', update);

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      observedImg?.removeEventListener('load', update);
      window.removeEventListener('resize', update);
    };
  }, [containerRef, imageRef, imageSrc, update]);

  return overlayStyle;
}
