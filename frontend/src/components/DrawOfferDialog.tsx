import { motion } from 'framer-motion';

interface DrawOfferDialogProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function DrawOfferDialog({ onAccept, onDecline }: DrawOfferDialogProps) {
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
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 12 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      >
        <h3>Draw Offer</h3>
        <p className="draw-offer-text">Your opponent is offering a draw. Accept?</p>
        <div className="draw-offer-buttons">
          <button className="btn btn-primary" onClick={onAccept} type="button">
            Accept
          </button>
          <button className="btn btn-outline" onClick={onDecline} type="button">
            Decline
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}