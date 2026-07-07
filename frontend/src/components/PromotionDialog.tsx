import type { Color } from '@/types';

interface PromotionDialogProps {
  color: Color;
  onSelect: (piece: 'q' | 'r' | 'b' | 'n') => void;
}

export function PromotionDialog({ color, onSelect }: PromotionDialogProps) {
  const prefix = color === 'white' ? 'w' : 'b';
  const pieces: { key: 'q' | 'r' | 'b' | 'n'; file: string }[] = [
    { key: 'q', file: `/pieces/${prefix}Q.svg` },
    { key: 'r', file: `/pieces/${prefix}R.svg` },
    { key: 'b', file: `/pieces/${prefix}B.svg` },
    { key: 'n', file: `/pieces/${prefix}N.svg` },
  ];

  return (
    <div className="promo-overlay">
      <div className="promo-card">
        <h3>Promote to</h3>
        <div className="promo-options">
          {pieces.map(p => (
            <button
              key={p.key}
              className="promo-btn"
              onClick={() => onSelect(p.key)}
              type="button"
            >
              <img src={p.file} alt={p.key} draggable={false} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}