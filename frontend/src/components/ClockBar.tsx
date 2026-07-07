import { formatClock } from '@/utils/format';
import type { Color } from '@/types';

interface ClockBarProps {
  name: string;
  clockMs: number;
  color: Color;
  isActive: boolean;
  position: 'top' | 'bottom';
}

export function ClockBar({ name, clockMs, color, isActive, position }: ClockBarProps) {
  const low = clockMs < 30000 && clockMs > 0;
  const expired = clockMs <= 0;

  return (
    <div className={`player-bar ${position} ${isActive ? 'active' : ''}`}>
      <div className="player-info">
        <span className="color-dot" data-color={color} />
        <span className="player-name">{name}</span>
      </div>
      <span className={`clock ${low || expired ? 'clock-low' : ''}`}>
        {formatClock(clockMs)}
      </span>
    </div>
  );
}