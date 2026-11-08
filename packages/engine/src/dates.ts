// Calendar-date helpers. Pure: no clock is read.

const DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** The local calendar date of an ISO datetime as written (offset not applied): "2026-11-12T19:00:00-08:00" → "2026-11-12". */
export function localDate(isoDateTime: string): string {
  const m = DATE.exec(isoDateTime);
  if (!m) throw new Error(`Not an ISO date: ${isoDateTime}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Days since 1970-01-01 for an ISO date (or the local date of an ISO datetime). */
export function dayNumber(iso: string): number {
  const [y, mo, d] = localDate(iso).split('-').map(Number) as [number, number, number];
  return Date.UTC(y, mo - 1, d) / 86_400_000;
}
