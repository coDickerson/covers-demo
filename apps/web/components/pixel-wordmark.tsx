// "Covers" set in pixels, drawn from a grid like the bell and the street, so the wordmark matches the demo's pixel art.
// Each letter is 4 grid pixels wide and 7 tall, with one pixel between letters. Color comes from currentColor.
const GLYPHS: Record<string, string[]> = {
  C: ['.###', '#...', '#...', '#...', '#...', '#...', '.###'],
  o: ['....', '....', '.##.', '#..#', '#..#', '#..#', '.##.'],
  v: ['....', '....', '#..#', '#..#', '#..#', '.##.', '.##.'],
  e: ['....', '....', '.##.', '#..#', '####', '#...', '.###'],
  r: ['....', '....', '#.##', '##..', '#...', '#...', '#...'],
  s: ['....', '....', '.###', '#...', '.##.', '...#', '###.'],
};

export function PixelWordmark({ text = 'Covers', className = '' }: { text?: string; className?: string }) {
  const letters = [...text].map((c) => GLYPHS[c] ?? GLYPHS.o!);
  const width = letters.length * 5 - 1;
  return (
    <svg viewBox={`0 0 ${width} 7`} role="img" aria-label={text} className={className} shapeRendering="crispEdges">
      {letters.flatMap((rows, n) => rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? <rect key={`${n}-${x}-${y}`} x={n * 5 + x} y={y} width="1.02" height="1.02" fill="currentColor" /> : null))))}
    </svg>
  );
}
