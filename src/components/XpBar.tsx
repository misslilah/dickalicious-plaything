import { xpProgressInLevel } from '../lib/levels';
import type { Level } from '../types';

interface XpBarProps {
  totalXp: number;
  levels: Level[];
  levelName: string;
}

export function XpBar({ totalXp, levels, levelName }: XpBarProps) {
  const { current, max, percent } = xpProgressInLevel(totalXp, levels);

  return (
    <div className="xp-bar">
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
