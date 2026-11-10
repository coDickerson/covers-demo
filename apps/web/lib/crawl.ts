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

/**
 * Life inside the bars, cut from the bar art itself so it stays in the same style: each is a small piece of one bar's
 * picture ([x, y, w, h], in that picture's pixels). bob: a guest shifting in their seat or leaning in to talk; sway: a
 * bartender working or someone standing; flicker: a neon sign or lantern catching; warm: the room's light rising and
 * falling (a tint over the window, not a cut-out). every/delay are in slow-motion units, so no two move together.
 */
export const LIVES: { kind: 'bob' | 'sway' | 'flicker' | 'warm'; bar: number; rect: [number, number, number, number]; every: number; delay: number }[] = [
  // The Buena Vista: three regulars at the window tables, the bartender behind the counter, the room's warm light.
  { kind: 'warm', bar: 0, rect: [168, 150, 170, 84], every: 9, delay: 0 },
  { kind: 'bob', bar: 0, rect: [180, 195, 16, 16], every: 6, delay: 1 },
  { kind: 'bob', bar: 0, rect: [226, 197, 16, 15], every: 7.5, delay: 3.5 },
  { kind: 'bob', bar: 0, rect: [302, 196, 18, 16], every: 5.5, delay: 2 },
  { kind: 'sway', bar: 0, rect: [266, 170, 17, 22], every: 7, delay: 0.5 },
  // Vesuvio's windows glow; at Tosca the red neon catches, two booths talk and the bartender works.
  { kind: 'warm', bar: 1, rect: [2, 130, 46, 62], every: 11, delay: 2 },
  { kind: 'flicker', bar: 1, rect: [205, 68, 170, 34], every: 13, delay: 4 },
  { kind: 'warm', bar: 1, rect: [160, 120, 260, 92], every: 10, delay: 5 },
  { kind: 'bob', bar: 1, rect: [183, 159, 17, 16], every: 6.5, delay: 0 },
  { kind: 'bob', bar: 1, rect: [218, 159, 20, 16], every: 5, delay: 2.5 },
  { kind: 'sway', bar: 1, rect: [277, 148, 16, 22], every: 8, delay: 1.5 },
  { kind: 'bob', bar: 1, rect: [338, 159, 17, 16], every: 7, delay: 4.5 },
  { kind: 'bob', bar: 1, rect: [373, 159, 18, 16], every: 6, delay: 1 },
  // Li Po: the vertical neon, the lantern in the grotto, guests at the counter and the bartender.
  { kind: 'flicker', bar: 2, rect: [196, 40, 16, 70], every: 9, delay: 1 },
  { kind: 'sway', bar: 2, rect: [112, 128, 22, 36], every: 6, delay: 0 },
  { kind: 'bob', bar: 2, rect: [98, 172, 12, 16], every: 5.5, delay: 2 },
  { kind: 'bob', bar: 2, rect: [111, 169, 10, 14], every: 7, delay: 4 },
  { kind: 'sway', bar: 2, rect: [135, 166, 16, 18], every: 6.5, delay: 1.5 },
  // Pacific Cocktail Haven: the teal neon and two guests among the plants.
  { kind: 'flicker', bar: 3, rect: [46, 97, 50, 22], every: 12, delay: 6 },
  { kind: 'bob', bar: 3, rect: [68, 162, 14, 16], every: 6, delay: 0.5 },
  { kind: 'bob', bar: 3, rect: [94, 161, 14, 16], every: 7.5, delay: 3 },
  // Smuggler's Cove: the lanterns and portholes flicker, the bartender shakes, two guests at the bar.
  { kind: 'flicker', bar: 4, rect: [4, 62, 8, 14], every: 5, delay: 0 },
  { kind: 'flicker', bar: 4, rect: [63, 30, 12, 18], every: 6, delay: 2 },
  { kind: 'flicker', bar: 4, rect: [122, 62, 8, 14], every: 5.5, delay: 3.5 },
  { kind: 'warm', bar: 4, rect: [22, 20, 94, 30], every: 9, delay: 1 },
  { kind: 'sway', bar: 4, rect: [90, 102, 14, 17], every: 3, delay: 0 },
  { kind: 'bob', bar: 4, rect: [68, 113, 14, 18], every: 6, delay: 1.5 },
  { kind: 'bob', bar: 4, rect: [104, 113, 14, 18], every: 7, delay: 4 },
  // Trick Dog: the regular in the Ramp tee and the two at the table, under the warm light.
  { kind: 'warm', bar: 5, rect: [88, 140, 72, 46], every: 10, delay: 3 },
  { kind: 'sway', bar: 5, rect: [95, 152, 14, 26], every: 6, delay: 0 },
  { kind: 'bob', bar: 5, rect: [112, 163, 14, 16], every: 5.5, delay: 2 },
  { kind: 'bob', bar: 5, rect: [134, 160, 14, 16], every: 7, delay: 4.5 },
];

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

// The room for the street between the view buttons (top) and the step strip (bottom), and the camera y that centres the
// bars and the sidewalk (art rows y0..y1) in it, so the street sits in the middle of any window, not along the bottom.
const ABOVE = 52, BELOW = 76;
export const band = (h: number) => Math.max(160, h - ABOVE - BELOW);
export const middle = (h: number, y0: number, y1: number, scale: number) => Math.round(ABOVE + (band(h) - (y1 - y0) * scale) / 2 - y0 * scale);

/**
 * The camera for a step: that bar, at the largest whole-number zoom that fits beside the task panel (`panel` pixels on
 * the right). With `street`, it shows that whole stretch of street instead.
 */
export function camera(step: number, w: number, h: number, street: number | null = null, panel = 0): Camera {
  const s = STOPS[step] ?? STOPS[0];
  if (street !== null) {
    const st = STREETS[street] ?? STREETS[0], rw = st.to - st.from, scale = Math.min(1, (w - 48) / rw, band(h) / (CRAWL.height - (TOP - 250)));
    return { scale, x: Math.round((w - rw * scale) / 2 - st.from * scale), y: middle(h, TOP - 250, CRAWL.height, scale) };
  }
  const x0 = s.span[0] - 70, x1 = s.span[1] + 70;
  const y0 = TOP - 250, y1 = CRAWL.height, avail = Math.max(240, w - panel);
  const fit = Math.min((avail * 0.94) / (x1 - x0), (band(h) * 0.94) / (y1 - y0));
  const scale = fit >= 1 ? Math.min(3, Math.floor(fit)) : fit;
  return { scale, x: Math.round(avail / 2 - ((x0 + x1) / 2) * scale), y: middle(h, y0, y1, scale) };
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

/**
 * Lamps, strings of lights, the flower stand, the chalkboard and the city's own touches. `frame` advances about six
 * times a second: slow things (lights, lanterns, flags) move on `tick`, every third frame; passers-by move every frame.
 * Everything sits in a gap between bars or far behind them, and the passers-by come by only now and then.
 */
export function drawDeco(g: CanvasRenderingContext2D, frame: number) {
  const tick = (frame / 3) | 0;
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
  g.clearRect(0, 0, CRAWL.width, CRAWL.height);
  drawCity(g, R, frame, 'behind');

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
  drawCity(g, R, frame, 'front');
}

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;
/**
 * San Francisco itself, kept small: the Golden Gate far off past the Wharf, fog rolling in over the Wharf end, a sea
 * lion on a crate, parrots on the North Beach lights, the Painted Ladies far behind the flower stand, a mural wall past
 * Trick Dog, and now and then a Muni bus down the road and a dragon dance along the Chinatown sidewalk.
 */
function drawCity(g: CanvasRenderingContext2D, R: Rect, frame: number, layer: 'behind' | 'front') {
  const tick = (frame / 3) | 0;
  if (layer === 'behind') {
    // The Golden Gate, far off beyond the start of the street: a pale orange tower and its cables over a line of bay.
    g.globalAlpha = 0.55;
    R(0, TOP - 34, 60, 2, '#9fb8c8');
    for (const x0 of [22, 34]) { R(x0, TOP - 118, 4, 84, '#e0896c'); R(x0, TOP - 120, 4, 2, '#c96f54'); }
    for (const y of [TOP - 106, TOP - 84, TOP - 62]) R(22, y, 16, 3, '#e0896c');
    for (let i = 0; i < 20; i++) { R(25 - i, TOP - 116 + i * 4, 1, 1, '#c96f54'); R(37 + i, TOP - 116 + i * 4, 1, 1, '#c96f54'); }
    g.globalAlpha = 1;
    // The Painted Ladies, far behind the flower stand: three pale pastel Victorians on the hill.
    g.globalAlpha = 0.5;
    [['#a8cfe0', 1584], ['#f2c0cf', 1606], ['#f5e2a8', 1628]].forEach(([c, x0]) => {
      const x = x0 as number;
      for (let y = 0; y < 9; y++) R(x + 9 - y, TOP - 112 + y, 2 * y + 2, 1, '#8a7a96');
      R(x, TOP - 103, 20, 103, c as string);
      for (const wy of [TOP - 98, TOP - 84, TOP - 70, TOP - 56]) { R(x + 2, wy, 6, 8, '#fdfbf6'); R(x + 12, wy, 6, 8, '#fdfbf6'); }
      R(x + 7, TOP - 18, 6, 18, '#fdfbf6'); R(x + 8, TOP - 16, 4, 16, '#8a7a96');
      R(x - 1, TOP - 104, 22, 1, '#fdfbf6');
    });
    g.globalAlpha = 1;
    // A mural wall in the Mission, past Trick Dog.
    const mx = 2196, mw = 34, mh = 44;
    R(mx, TOP - mh, mw, mh, '#2a2420'); R(mx + 1, TOP - mh + 1, mw - 2, mh - 1, '#f2c14e');
    R(mx + 1, TOP - 20, mw - 2, 19, '#2bb5e0'); R(mx + 4, TOP - 34, 12, 12, '#ff4f8b'); R(mx + 6, TOP - 32, 8, 8, '#ff8a3a');
    R(mx + 18, TOP - 38, 12, 6, '#7ad36a'); R(mx + 20, TOP - 30, 10, 10, '#b07ad8'); R(mx + 3, TOP - 14, 28, 3, '#ffffff'); R(mx + 9, TOP - 9, 16, 3, '#ff4f8b');
    R(mx + 9, TOP - 30, 2, 2, '#2a2420'); R(mx + 22, TOP - 27, 2, 2, '#2a2420');
    // A sea lion on a crate between the Wharf and North Beach, lifting its head now and then.
    const sx = 428, up = tick % 9 < 2 ? 2 : 0;
    R(sx, TOP - 12, 22, 12, '#2a221c'); R(sx + 1, TOP - 11, 20, 10, '#9a6a3c'); R(sx + 1, TOP - 7, 20, 1, '#7a5230');
    R(sx + 3, TOP - 19, 14, 7, '#5c4636'); R(sx + 2, TOP - 17, 2, 4, '#5c4636'); R(sx + 14, TOP - 24 - up, 6, 7, '#5c4636'); R(sx + 18, TOP - 22 - up, 3, 2, '#5c4636');
    R(sx + 17, TOP - 23 - up, 1, 1, '#141414'); R(sx + 5, TOP - 18, 8, 1, '#7a6250'); R(sx + 15, TOP - 12, 3, 2, '#5c4636');
    if (up) { R(sx + 23, TOP - 29, 1, 1, '#7a7672'); R(sx + 25, TOP - 31, 1, 1, '#7a7672'); }
    // Two of Telegraph Hill's wild parrots on the North Beach lights, hopping now and then.
    [[962, 0], [984, 4]].forEach(([px0, off]) => {
      const t = (px0! - 940) / 67, py = Math.round(TOP - 153 + (TOP - 111 - (TOP - 153)) * t + Math.sin(t * Math.PI) * 16), hop = (tick + off!) % 11 === 0 ? 2 : 0;
      R(px0! - 2, py - 6 - hop, 5, 5, '#3fae4a'); R(px0! - 1, py - 8 - hop, 3, 3, '#d0322b'); R(px0! + 2, py - 7 - hop, 1, 1, '#e8a33a'); R(px0! - 3, py - 3 - hop, 2, 3, '#2a8a3a'); R(px0!, py - 7 - hop, 1, 1, '#141414');
    });
    return;
  }
  // In front: Karl the fog, a soft bank drifting in over the Wharf rooftops and thinning out toward North Beach.
  const drift = (frame / 4) | 0;
  [[0, 34, 18], [70, 26, 14], [150, 40, 16], [250, 22, 12], [360, 30, 10]].forEach(([x0, w, h], k) => {
    const x = Math.round(x0! + ((drift + k * 23) % 120) - 30), y = TOP - 292 + (k % 2) * 8;
    g.globalAlpha = 0.85 - k * 0.12;
    R(x + 4, y, w! - 8, 2, '#e3e7ea'); R(x, y + 2, w!, h! - 4, '#e3e7ea'); R(x + 3, y + h! - 2, w! - 6, 2, '#e3e7ea');
    R(x + w! - 2, y + 4, 10, h! - 8, '#e3e7ea'); R(x - 8, y + 5, 10, h! - 9, '#e3e7ea');
  });
  g.globalAlpha = 1;
  // Now and then a Muni bus comes down the road (about once a minute, end to end).
  const busX = ((frame * 6) % 4200) - 120;
  if (busX > -80 && busX < CRAWL.width + 10) {
    const by = TOP + 27;
    R(busX, by, 70, 19, '#2a2a2e'); R(busX + 1, by + 1, 68, 17, '#e9e9e4'); R(busX + 1, by + 12, 68, 3, '#c8322b');
    for (let i = 0; i < 6; i++) R(busX + 4 + i * 11, by + 3, 8, 6, '#3a4a5a');
    R(busX + 60, by + 3, 8, 8, '#3a4a5a'); R(busX + 63, by + 10, 4, 7, '#3a4a5a');
    R(busX + 8, by + 16, 8, 4, '#1a1a1a'); R(busX + 52, by + 16, 8, 4, '#1a1a1a'); R(busX + 3, by + 1, 14, 1, '#f2c14e');
  }
  // Now and then a dragon dance winds along the Chinatown sidewalk past Li Po (about every forty seconds).
  const dx = ((frame * 2) % 520) + 1060;
  if (dx < 1420) {
    for (let k = 0; k < 7; k++) {
      const x = dx - k * 7, y = TOP + 2 + Math.round(Math.sin((frame + k * 3) / 3) * 2);
      R(x, y, 8, 6, k % 2 ? '#d0322b' : '#e8b030'); R(x, y, 8, 1, '#f2c14e'); R(x + 2, y + 6, 1, 4, '#2a2420'); R(x + 5, y + 6 + ((frame + k) % 2), 1, 4 - ((frame + k) % 2), '#2a2420');
    }
    R(dx + 7, TOP - 1, 7, 8, '#d0322b'); R(dx + 8, TOP - 3, 2, 2, '#f2c14e'); R(dx + 11, TOP - 3, 2, 2, '#f2c14e'); R(dx + 12, TOP + 1, 1, 1, '#141414'); R(dx + 13, TOP + 4, 2, 2, '#ffffff');
  }
}
