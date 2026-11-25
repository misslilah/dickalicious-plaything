import { useEffect, useRef, useState } from 'react';
import { xpProgressInLevel } from '../lib/levels';

interface XpBarProps {
  totalXp: number;
  currentLevel: number;
  levelName: string;
}

const GAIN_FLASH_MS = 1100;

export function XpBar({ totalXp, currentLevel, levelName }: XpBarProps) {
  const { current, max, percent } = xpProgressInLevel(totalXp, currentLevel);

  // Purely visual: flash the bar briefly when XP increases (never on first render).
  const [gainFlash, setGainFlash] = useState(false);
  const prevXpRef = useRef(totalXp);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevXpRef.current;
    prevXpRef.current = totalXp;
    if (prev > 0 && totalXp > prev) {
      setGainFlash(false);
      // Re-trigger the CSS animation even on back-to-back gains.
      const raf = window.requestAnimationFrame(() => {
        setGainFlash(true);
        if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => {
          setGainFlash(false);
          flashTimerRef.current = null;
        }, GAIN_FLASH_MS);
      });
      return () => window.cancelAnimationFrame(raf);
    }
    return undefined;
  }, [totalXp]);

  useEffect(
    () => () => {
      if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  return (
    <div className={`xp-bar${gainFlash ? ' xp-bar--gain' : ''}`} data-xp-bar>
      <div className="xp-bar__header">
        <span className="xp-bar__level">{levelName}</span>
        <span className="xp-bar__xp">
          {totalXp} XP · {current}/{max}
        </span>
      </div>
      <div
        className="xp-bar__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="xp-bar__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
