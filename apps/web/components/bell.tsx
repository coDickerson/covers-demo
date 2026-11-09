// The guide: a small cloche that walks the path. Drawn from a pixel grid, colored by tokens.
const FILL: Record<string, string> = { K: 'var(--color-ink-primary)', G: 'var(--color-border)', W: 'var(--color-bg-surface)' };
const BODY = ['.....KK.....', '.....KK.....', '...KKKKKK...', '..KGGGGGGK..', '.KGWGGGGGGK.', '.KGGKGGKGGK.', '.KGGGGGGGGK.', 'KKKKKKKKKKKK'];
const LEGS = [['....K..K....', '....K..K....', '....KK.KK...'], ['....K..K....', '...K....K...', '..KK.....KK.'], ['....K..K....', '....K..K....', '....KK.K....'], ['....K..K....', '....K...K...', '...KK....KK.'], ['....K..K....', '....K..K....', '....K..KK...']];
export const BELL_FRAMES = LEGS.length;

export function Bell({ frame = 0, className = '' }: { frame?: number; className?: string }) {
  const rows = [...BODY, ...LEGS[frame % BELL_FRAMES]!];
  return (
    <svg viewBox={`0 0 12 ${rows.length}`} aria-hidden="true" className={className} shapeRendering="crispEdges">
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={FILL[c]} />)))}
    </svg>
  );
}
