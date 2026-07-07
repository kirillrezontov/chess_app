interface MoveListProps {
  moves: string[];
}

export function MoveList({ moves }: MoveListProps) {
  if (!moves || moves.length === 0) {
    return (
      <div className="movelist-card">
        <h3>Moves</h3>
        <p className="empty-text">No moves yet</p>
      </div>
    );
  }

  const rows: { num: number; w: string; b?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      num: Math.floor(i / 2) + 1,
      w: moves[i],
      b: moves[i + 1] || undefined,
    });
  }

  return (
    <div className="movelist-card">
      <h3>Moves</h3>
      <div className="movelist-scroll" ref={el => el?.scrollTo(0, el.scrollHeight)}>
        <table className="movelist-table">
          <tbody>
            {rows.map(r => (
              <tr key={r.num}>
                <td className="move-num">{r.num}.</td>
                <td className="move-w">{r.w}</td>
                <td className="move-b">{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}