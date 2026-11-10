// The closure moment from the storyboard: a stamp slams down when a dinner clears and when it closes out.
export type StampTone = 'ok' | 'near';

const TONE: Record<StampTone, string> = { ok: 'border-status-ok text-status-ok', near: 'border-status-near text-status-near' };

export function Stamp({ text, tone }: { text: string; tone: StampTone }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
      <div className={`covers-stamp border-4 bg-bg-canvas px-8 py-3 font-mono text-display font-bold tracking-widest ${TONE[tone]}`}>{text}</div>
    </div>
  );
}
