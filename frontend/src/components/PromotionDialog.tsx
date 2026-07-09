import { motion } from 'framer-motion';
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
    <motion.div
      className="promo-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="promo-card"
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.85, y: 20 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      >
        <h3>Promote to</h3>
        <div className="promo-options">
          {pieces.map((p, i) => (
            <motion.button
              key={p.key}
              className="promo-btn"
              onClick={() => onSelect(p.key)}
              type="button"
              initial={{ scale: 0, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20, delay: i * 0.05 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <img src={p.file} alt={p.key} draggable={false} />
            </motion.button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}