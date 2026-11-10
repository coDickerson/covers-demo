// The dinner as a bar crawl: one straight San Francisco street (public/crawl/), seven bars in walking order from the
// Wharf to the Mission, one per step. Everything is in grid pixels: 1 pixel of art = 1 grid pixel, shown at
// whole-number zoom so the bars, the sidewalk, the drawn details and the cable car share one pixel grid.

/** The street: its length, the sidewalk's top edge, and the line the cable car's feet walk on. */
export const CRAWL = { width: 2290, height: 350, top: 300, walk: 318 } as const;
const TOP = CRAWL.top;

/** The bar art, placed on the street. `rise` is how far each picture reaches above the sidewalk's top edge. */
export const BARS = [
  { src: '/crawl/bar-wharf.png', x: 70, width: 345, rise: 247 },
  { src: '/crawl/bar-northbeach.png', x: 520, width: 424, rise: 220 },
  { src: '/crawl/bar-chinatown.png', x: 1130, width: 227, rise: 225 },
  { src: '/crawl/bar-pch.png', x: 1430, width: 147, rise: 209 },
  { src: '/crawl/bar-smugglers.png', x: 1650, width: 138, rise: 159 },
  { src: '/crawl/bar-mission.png', x: 1960, width: 224, rise: 207 },
] as const;

/** One bar per step. `span` is the stretch of sidewalk in front of it where that step's checks stand. */
export const STOPS = [
  { name: 'The Buena Vista', hood: 'Fisherman’s Wharf', bar: 0, span: [150, 300] },
  { name: 'Vesuvio', hood: 'North Beach', bar: 1, span: [530, 650] },
  { name: 'Tosca Cafe', hood: 'North Beach', bar: 1, span: [720, 900] },
  { name: 'Li Po', hood: 'Chinatown', bar: 2, span: [1190, 1320] },
  { name: 'Pacific Cocktail Haven', hood: 'Union Square', bar: 3, span: [1440, 1545] },
  { name: 'Smuggler’s Cove', hood: 'Hayes Valley', bar: 4, span: [1660, 1765] },
  { name: 'Trick Dog', hood: 'The Mission', bar: 5, span: [1995, 2110] },
] as const satisfies readonly { name: string; hood: string; bar: number; span: readonly [number, number] }[];

/** The two stretches of the street. The second opens at Dinner. */
export const STREETS = [
  { name: 'Fisherman’s Wharf to North Beach', from: 0, to: 1080 },
  { name: 'Chinatown to the Mission', from: 1090, to: CRAWL.width },
] as const;
export const streetOf = (step: number) => (step < 3 ? 0 : 1);

/** The cable car (public/crawl/cablecar-L-F.png): L = bars finished (0–6, a little looser each time), F = 0 stand, 1–2 steps. */
export const CAR = { width: 64, height: 60, src: (level: number, frame: number) => `/crawl/cablecar-${Math.max(0, Math.min(6, level))}-${frame}.png` } as const;

export type Camera = { x: number; y: number; scale: number };
const X0 = 40, X1 = CRAWL.width - 40;
const pct = (x: number) => ((x - X0) / (X1 - X0)) * 100;

/**
 * The camera for a step: that bar, at the largest whole-number zoom that fits beside the task panel (`panel` pixels on
 * the right). With `street`, it shows that whole stretch of street instead.
 */
export function camera(step: number, w: number, h: number, street: number | null = null, panel = 0): Camera {
  const s = STOPS[step] ?? STOPS[0];
  if (street !== null) {
    const st = STREETS[street] ?? STREETS[0], rw = st.to - st.from, scale = Math.min(1, (w - 48) / rw, (h - 48) / (CRAWL.height - 40));
    return { scale, x: Math.round((w - rw * scale) / 2 - st.from * scale), y: Math.round(h * 0.55 - (TOP - 100) * scale) };
  }
  const x0 = s.span[0] - 70, x1 = s.span[1] + 70;
  const y0 = TOP - 250, y1 = CRAWL.height, avail = Math.max(240, w - panel);
  const fit = Math.min((avail * 0.94) / (x1 - x0), (h * 0.94) / (y1 - y0));
  const scale = fit >= 1 ? Math.min(3, Math.floor(fit)) : fit;
  return { scale, x: Math.round(avail / 2 - ((x0 + x1) / 2) * scale), y: Math.round(h - 16 - y1 * scale) };
}

/**
 * Geometry for one step. The path is the whole street, so the cable car never jumps: stops[0] is where this step's walk
 * starts (the last bar), stops[i + 1] is check i, and the last stop is just past the bar, all as a percentage of the street.
 */
export function crawlPath(step: number, count: number, w: number, h: number, street: number | null = null, view?: Camera | null, panel = 0) {
  const cam = view ?? camera(step, w, h, street, panel), s = STOPS[step] ?? STOPS[0];
  const prev = STOPS[step - 1], from = prev ? prev.span[1] + 14 : 100, to = s.span[1] + 14, n = Math.max(1, count);
  const xs = Array.from({ length: n }, (_, i) => Math.round(s.span[0] + ((i + 0.5) / n) * (s.span[1] - s.span[0])));
  return {
    points: xs.map((x) => ({ x: cam.x + x * cam.scale, y: cam.y + CRAWL.walk * cam.scale })),
    stops: [pct(from), ...xs.map(pct), pct(to)],
    camera: cam,
    artD: `M${X0} ${CRAWL.walk} L${X1} ${CRAWL.walk}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Drawn details. The sidewalk and each neighbourhood's touches are drawn in code on the same grid, so they can move.

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** One sidewalk for the whole street (the art's own slab strip, repeated), then a thin road breaking up into pixels. */
export function drawGround(g: CanvasRenderingContext2D, walk: HTMLImageElement) {
  const W = CRAWL.width, H = 50;
  g.clearRect(0, 0, W, H);
  for (let x = 0; x < W; x += walk.width) g.drawImage(walk, x, 0);
  g.fillStyle = '#968F85'; g.fillRect(0, 34, W, 16);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const keep = Math.min(1, Math.min(x, W - 1 - x) / 56) * (y < 38 ? 1 : 1 - (y - 38) / 12);
    if (keep < 1 && BAYER[y % 4]![x % 4]! / 16 >= keep) d[(y * W + x) * 4 + 3] = 0;
  }
  g.putImageData(img, 0, 0);
}

const GLYPH: Record<string, string> = { R: '110101110101101', A: '010101111101101', M: '101111111101101', P: '110101110100100', H: '101101111101101', Y: '101101010010010', O: '010101101101010', U: '101101101101111' };

/** Lamps, strings of lights, the flower stand and the chalkboard. `tick` advances twice a second so things move a pixel. */
export function drawDeco(g: CanvasRenderingContext2D, tick: number) {
  const R = (a: number, b: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(a, b, w, h); };
  const text = (s: string, x: number, y: number, c: string) => [...s].forEach((ch, i) => { const gl = GLYPH[ch]; if (gl) for (let k = 0; k < 15; k++) if (gl[k] === '1') R(x + i * 4 + (k % 3), y + ((k / 3) | 0), 1, 1, c); });
  const lamp = (x: number, bands: boolean) => {
    R(x - 4, TOP - 4, 9, 4, '#1f2a24'); R(x - 2, TOP - 112, 5, 108, '#1f2a24');
    if (bands) { R(x - 2, TOP - 100, 5, 22, '#2e7d4f'); R(x - 2, TOP - 78, 5, 22, '#f4f1e8'); R(x - 2, TOP - 56, 5, 22, '#c8322b'); }
    R(x - 7, TOP - 118, 15, 3, '#1f2a24'); R(x - 5, TOP - 130, 11, 12, '#1f2a24'); R(x - 4, TOP - 129, 9, 10, '#f6d27a'); R(x - 6, TOP - 133, 13, 3, '#1f2a24'); R(x - 1, TOP - 136, 3, 3, '#1f2a24');
  };
  const post = (x: number, h: number, c: string) => { R(x - 2, TOP - h, 5, h, c); R(x - 4, TOP - 4, 9, 4, c); R(x - 3, TOP - h - 2, 7, 2, c); R(x - 1, TOP - h - 4, 3, 2, c); };
  const strand = (ax: number, ay: number, bx: number, by: number, sag: number, every: number, draw: (x: number, y: number, k: number) => void) => {
    for (let i = 0; i <= 80; i++) {
      const t = i / 80, x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t + Math.sin(t * Math.PI) * sag);
      R(x, y, 1, 1, '#3a3330');
      const k = (i / every) | 0;
      if (i % every === every >> 1 && k > 0) draw(x, y, k);
    }
  };
  g.clearRect(0, 0, CRAWL.width, TOP + 10);

  // The Wharf: an SF lamp with a gull that hops now and then.
  lamp(468, false);
  const gx = 466, gy = TOP - 136 - (tick % 7 === 0 ? 2 : 0);
  R(gx - 4, gy - 6, 9, 5, '#f4f4f0'); R(gx + 3, gy - 9, 4, 4, '#f4f4f0'); R(gx - 4, gy - 6, 6, 2, '#9aa0a6'); R(gx + 7, gy - 8, 2, 1, '#e8a33a'); R(gx + 5, gy - 8, 1, 1, '#141414');

  // North Beach: Italian lights from Tosca's cornice to a hook on a green, white and red lamp post.
  lamp(1010, true); R(1006, TOP - 112, 3, 2, '#1f2a24');
  strand(940, TOP - 153, 1007, TOP - 111, 16, 8, (x, y, k) => { g.globalAlpha = (k + tick) % 4 ? 1 : 0.45; R(x - 1, y + 1, 3, 3, ['#2e9d5a', '#f4f1e8', '#e0413a'][k % 3]!); g.globalAlpha = 1; });

  // Chinatown: red lanterns from the tip of Li Po's eave to a pole, swaying a pixel.
  post(1404, 186, '#7a2a20');
  strand(1339, TOP - 203, 1404, TOP - 186, 12, 16, (x, y, k) => { const s = (k + tick) % 2; R(x, y + 1, 1, 2, '#3a3330'); R(x - 2 + s, y + 3, 5, 6, '#d0322b'); R(x - 2 + s, y + 3, 5, 1, '#f2c14e'); R(x - 2 + s, y + 8, 5, 1, '#f2c14e'); R(x + s, y + 9, 1, 2, '#f2c14e'); });

  // Union Square: a flower stand, a wooden cart under a striped awning with buckets of flowers.
  const fx = 1590, OUT = '#2a221c', WOOD = '#8a5a34', WOODL = '#a9744a', WOODD = '#6a4226';
  R(fx + 3, TOP - 46, 2, 26, WOODD); R(fx + 37, TOP - 46, 2, 26, WOODD); R(fx - 1, TOP - 52, 44, 7, OUT);
  for (let i = 0; i < 42; i++) R(fx + i, TOP - 51, 1, 5, ((i / 6) | 0) % 2 ? '#f4f1e8' : '#c8322b');
  for (let i = 0; i < 42; i += 6) { const c = ((i / 6) | 0) % 2 ? '#f4f1e8' : '#c8322b'; R(fx + i, TOP - 46, 6, 1, c); R(fx + i + 1, TOP - 45, 4, 1, c); }
  [['#ff6fa8', '#ff9cc2'], ['#f2c14e', '#ffe08a'], ['#e0413a', '#ff7a6a'], ['#ffffff', '#e6e2f0'], ['#b07ad8', '#d4a8f0']].forEach(([c, hi], k) => {
    const bx = fx + 3 + k * 7, up = (k + tick) % 4 === 0 ? 1 : 0;
    R(bx, TOP - 26, 6, 5, '#8a9098'); R(bx, TOP - 26, 6, 1, '#b8bec6'); R(bx + 5, TOP - 25, 1, 4, '#6a7078');
    R(bx + 1, TOP - 30, 1, 4, '#2e7d4f'); R(bx + 4, TOP - 30, 1, 4, '#2e7d4f');
    R(bx, TOP - 33 - up, 6, 3, c!); R(bx + 1, TOP - 34 - up, 4, 1, c!); R(bx + 1, TOP - 33 - up, 1, 1, hi!); R(bx + 4, TOP - 32 - up, 1, 1, hi!);
  });
  R(fx, TOP - 22, 42, 12, OUT); R(fx + 1, TOP - 21, 40, 10, WOOD); R(fx + 1, TOP - 21, 40, 1, WOODL);
  for (let i = fx + 8; i < fx + 41; i += 8) R(i, TOP - 20, 1, 9, WOODD);
  R(fx + 41, TOP - 18, 8, 2, WOODD); R(fx + 48, TOP - 19, 2, 4, OUT);
  for (const wx of [fx + 9, fx + 32]) {
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const d = Math.hypot(dx, dy); if (d <= 5.4 && d >= 4.2) R(wx + dx, TOP - 6 + dy, 1, 1, OUT); }
    R(wx - 4, TOP - 6, 9, 1, WOODD); R(wx, TOP - 10, 1, 9, WOODD); R(wx - 1, TOP - 7, 3, 3, OUT);
  }

  // Hayes Valley: rope and ship lanterns from Smuggler's Cove's roof to a wooden piling.
  post(1840, 150, '#5a3a22');
  strand(1786, TOP - 152, 1840, TOP - 150, 16, 20, (x, y, k) => { R(x, y + 1, 1, 3, '#333333'); R(x - 2, y + 4, 5, 6, (k + tick) % 3 ? '#ffb84a' : '#e09a30'); R(x - 2, y + 4, 5, 1, '#333333'); });

  // The Mission: papel picado from a pole to Trick Dog's wall, fluttering.
  post(1885, 180, '#4a4a4a');
  const pc = ['#ff4f8b', '#2bb5e0', '#f2c14e', '#7ad36a', '#b07ad8', '#ff8a3a'];
  strand(1885, TOP - 180, 1981, TOP - 188, 10, 10, (x, y, k) => { const f = (k + tick) % 2; R(x - 3, y + 1, 7, 7 - f, pc[k % pc.length]!); R(x - 1, y + 3, 1, 1, '#ffffff'); R(x + 1, y + 4, 1, 1, '#ffffff'); });
  R(1979, TOP - 190, 3, 3, '#3a3330');

  // For the judges: a chalkboard on the sidewalk pointing into Trick Dog.
  const bx = 1920, BW = 46, BH = 34, by = TOP - BH - 2;
  R(bx + 3, by + BH - 2, 3, 6, WOODD); R(bx + BW - 6, by + BH - 2, 3, 6, WOODD);
  R(bx, by, BW, BH, OUT); R(bx + 1, by + 1, BW - 2, BH - 2, WOOD); R(bx + 3, by + 3, BW - 6, BH - 6, '#2b302e');
  for (let i = 0; i < 14; i++) R(bx + 4 + ((i * 7) % (BW - 8)), by + 4 + ((i * 5) % (BH - 8)), 1, 1, '#363c3a');
  const mid = (s: string) => bx + (((BW - (s.length * 4 - 1)) / 2) | 0);
  text('RAMP', mid('RAMP'), by + 5, '#E4F222'); text('HAPPY', mid('HAPPY'), by + 12, '#f4f1e8'); text('HOUR', mid('HOUR'), by + 18, '#f4f1e8');
  const ax = bx + 13 + (tick % 2), ay = by + 27;
  R(ax, ay, 16, 1, '#E4F222'); R(ax + 13, ay - 2, 1, 5, '#E4F222'); R(ax + 14, ay - 1, 1, 3, '#E4F222'); R(ax + 15, ay, 1, 1, '#E4F222');
}
