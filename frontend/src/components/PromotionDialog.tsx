import type { Color } from '@/types';

interface PromotionDialogProps {
  color: Color;
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
}

const PIECES: Record<Color, { key: string; char: string }[]> = {
  white: [
    { key: 'q', char: '♕' },
    { key: 'r', char: '♖' },
    { key: 'b', char: '♗' },
    { key: 'n', char: '♘' },
  ],
  black: [
    { key: 'q', char: '♛' },
    { key: 'r', char: '♜' },
    { key: 'b', char: '♝' },
    { key: 'n', char: '♞' },
  ],
};

export function PromotionDialog({ color, onSelect }: PromotionDialogProps) {
  return (
    <div className="promo-overlay">
      <div className="promo-card">
        <h3>Promote to</h3>
        <div className="promo-options">
          {PIECES[color].map(p => (
            <button
              key={p.key}
              className="promo-btn"
              onClick={() => onSelect(p.key as 'q' | 'r' | 'b' | 'n')}
              type="button"
            >
              {p.char}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}