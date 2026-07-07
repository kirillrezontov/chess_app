/** Format milliseconds into "M:SS" chess clock display. */
export function formatClock(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}