interface MoveListProps {
  moves: string[];
  activeMoveIndex?: number | null;
  onMoveClick?: (index: number) => void;
}

export function MoveList({ moves, activeMoveIndex, onMoveClick }: MoveListProps) {
  if (!moves || moves.length === 0) {
    return (
      <div className="movelist-card">
        <h3>Moves</h3>
        <p className="empty-text">No moves yet</p>
      </div>
    );
  }

  const rows: { num: number; w: string; wIdx: number; b?: string; bIdx?: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      num: Math.floor(i / 2) + 1,
      w: moves[i],
      wIdx: i,
      b: moves[i + 1] || undefined,
      bIdx: i + 1 < moves.length ? i + 1 : undefined,
    });
  }

  const isClickable = !!onMoveClick;

  return (
    <div className="movelist-card">
      <h3>Moves</h3>
      <div
        className="movelist-scroll"
        ref={el => {
          if (el && activeMoveIndex !== undefined && activeMoveIndex !== null) {
            // Scroll active move into view
            const targetRow = el.querySelector('.move-active');
            if (targetRow) {
              targetRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
              el.scrollTop = el.scrollHeight;
            }
          } else {
            el?.scrollTo(0, el.scrollHeight);
          }
        }}
      >
        <table className="movelist-table">
          <tbody>
            {rows.map(r => (
              <tr key={r.num}>
                <td className="move-num">{r.num}.</td>
                <td
                  className={`move-w ${activeMoveIndex === r.wIdx ? 'move-active' : ''} ${isClickable ? 'move-clickable' : ''}`}
                  onClick={() => onMoveClick?.(r.wIdx)}
                >
                  {r.w}
                </td>
                <td
                  className={`move-b ${r.bIdx !== undefined && activeMoveIndex === r.bIdx ? 'move-active' : ''} ${isClickable ? 'move-clickable' : ''}`}
                  onClick={() => r.bIdx !== undefined && onMoveClick?.(r.bIdx)}
                >
                  {r.b}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}