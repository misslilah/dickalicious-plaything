import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  measureAndClampBadgeTooltip,
  type TooltipPlacement,
} from '../lib/badgeTooltipPosition';

export function useBadgeTooltipPosition() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const result = measureAndClampBadgeTooltip(anchor, tooltip);
    if (!result) return;

    setTooltipStyle(result.style);
    setPlacement(result.placement);
    tooltip.dataset.placement = result.placement;
  }, []);

  const resetPosition = useCallback(() => {
    setTooltipStyle({});
    setPlacement(null);
    const tooltip = tooltipRef.current;
    if (tooltip) delete tooltip.dataset.placement;
  }, []);

  useEffect(() => {
    if (!placement) return undefined;

    const onLayout = () => updatePosition();
    window.addEventListener('resize', onLayout);
    window.visualViewport?.addEventListener('resize', onLayout);
    window.visualViewport?.addEventListener('scroll', onLayout);
    window.addEventListener('scroll', onLayout, true);

    return () => {
      window.removeEventListener('resize', onLayout);
      window.visualViewport?.removeEventListener('resize', onLayout);
      window.visualViewport?.removeEventListener('scroll', onLayout);
      window.removeEventListener('scroll', onLayout, true);
    };
  }, [placement, updatePosition]);

  return {
    anchorRef,
    tooltipRef,
    tooltipStyle,
    updatePosition,
    resetPosition,
  };
}
