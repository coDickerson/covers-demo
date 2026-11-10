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

/**
 * Two of the city's own, in the bars' style (public/crawl/): a sea lion on a dock crate in the gap after the Buena
 * Vista, and a dragon dance that now and then parades along the Chinatown sidewalk past Li Po, head first, then is gone.
 * `travel` is how far the parade goes (grid pixels, leftward), `every` its cycle in slow-motion units.
 */
/** `head`: the piece of the sea lion picture that lifts now and then ([x, y, w, h]); the crate below never moves. */
export const SEALION = { src: '/crawl/sealion.png', x: 424, width: 47, height: 57, sink: 3, head: [22, 0, 18, 17] as [number, number, number, number] } as const;
/** The flower stand by Pacific Cocktail Haven, and for the judges a Ramp Happy Hour chalkboard pointing into Trick Dog. */
export const FLOWERS = { src: '/crawl/flowercart.png', x: 1586, width: 59, height: 60, sink: 2 } as const;
export const RAMP_BOARD = { src: '/crawl/rampboard.png', x: 1918, width: 50, height: 54, sink: 3 } as const;
export const DRAGON = { src: '/crawl/dragon.png', x: 1400, width: 83, height: 54, sink: 12, travel: -330, every: 100 } as const;

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
 * Lamps, strings of lights and the city's own touches. `frame` advances about six
 * times a second: slow things (lights, lanterns, flags) move on `tick`, every third frame; passers-by move every frame.
 * Everything sits in a gap between bars or far behind them, and the passers-by come by only now and then.
 */
export function drawDeco(g: CanvasRenderingContext2D, frame: number) {
  const tick = (frame / 3) | 0;
  const R = (a: number, b: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(a, b, w, h); };
  const text = (s: string, x: number, y: number, c: string) => [...s].forEach((ch, i) => { const gl = GLYPH[ch]; if (gl) for (let k = 0; k < 15; k++) if (gl[k] === '1') R(x + i * 4 + (k % 3), y + ((k / 3) | 0), 1, 1, c); });
  // A shade of a colour: f < 1 darker, f > 1 lighter. Lamps and posts are lit from the left.
  const tone = (c: string, f: number) => { const n = parseInt(c.slice(1), 16), ch = (v: number) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))); return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`; };
  const column = (x: number, top: number, bottom: number, w: number, c: string) => { R(x, top, w, bottom - top, c); R(x, top, 1, bottom - top, tone(c, 1.35)); R(x + w - 1, top, 1, bottom - top, tone(c, 0.65)); };
  const halo = (cx: number, cy: number, r0: number, r1: number, c: string) => {
    g.globalAlpha = 0.45;
    for (let dy = -r1; dy <= r1; dy++) for (let dx = -r1; dx <= r1; dx++) { const d = Math.hypot(dx, dy); if (d >= r0 && d <= r1 && BAYER[(cy + dy) & 3]![(cx + dx) & 3]! / 16 < (r1 - d) / (r1 - r0) * 0.6) R(cx + dx, cy + dy, 1, 1, c); }
    g.globalAlpha = 1;
  };
  const lamp = (x: number, bands: boolean) => {
    const POLE = '#1f2a24';
    R(x - 5, TOP - 3, 11, 3, tone(POLE, 0.8)); column(x - 4, TOP - 7, TOP - 3, 9, POLE);           // plinth and base
    column(x - 2, TOP - 112, TOP - 7, 5, POLE);
    if (bands) { column(x - 2, TOP - 100, TOP - 78, 5, '#2e7d4f'); column(x - 2, TOP - 78, TOP - 56, 5, '#ece7da'); column(x - 2, TOP - 56, TOP - 34, 5, '#c8322b'); }
    for (const y of [TOP - 34, TOP - 102]) column(x - 3, y - 1, y + 1, 7, POLE);                       // collar rings
    column(x - 3, TOP - 116, TOP - 112, 7, POLE);                                                      // neck
    R(x - 6, TOP - 118, 13, 2, POLE); R(x - 2, TOP - 116, 5, 1, tone(POLE, 1.3));
    R(x - 5, TOP - 131, 11, 13, POLE); R(x - 4, TOP - 130, 9, 11, '#f2c25e'); R(x - 3, TOP - 129, 3, 9, '#fff0b8'); R(x + 1, TOP - 129, 2, 9, '#f8dc8a');
    R(x, TOP - 130, 1, 11, POLE);                                                                      // glass panes and mullion
    R(x - 6, TOP - 133, 13, 2, POLE); R(x - 6, TOP - 133, 13, 1, tone(POLE, 1.4)); R(x - 4, TOP - 135, 9, 2, POLE);
    R(x - 1, TOP - 138, 3, 3, POLE); R(x, TOP - 140, 1, 2, POLE); R(x - 1, TOP - 138, 1, 1, tone(POLE, 1.5)); // finial
    halo(x, TOP - 124, 7, 12, '#fbe7a0');
  };
  const post = (x: number, h: number, c: string) => {
    R(x - 4, TOP - 3, 9, 3, tone(c, 0.8)); column(x - 3, TOP - 6, TOP - 3, 7, c);
    column(x - 2, TOP - h, TOP - 6, 5, c);
    for (const y of [TOP - 40, TOP - h + 18]) column(x - 3, y, y + 2, 7, c);
    column(x - 3, TOP - h - 2, TOP - h, 7, c); R(x - 1, TOP - h - 5, 3, 3, c); R(x - 1, TOP - h - 5, 1, 1, tone(c, 1.5));
  };
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

  // The Wharf: an SF lamp with a gull that hops now and then (the sea lion's crate sits just before it).
  lamp(496, false);
  const gx = 494, gy = TOP - 136 - (tick % 7 === 0 ? 2 : 0);
  R(gx - 4, gy - 6, 9, 5, '#f4f4f0'); R(gx + 3, gy - 9, 4, 4, '#f4f4f0'); R(gx - 4, gy - 6, 6, 2, '#9aa0a6'); R(gx + 7, gy - 8, 2, 1, '#e8a33a'); R(gx + 5, gy - 8, 1, 1, '#141414');

  // North Beach: Italian lights from Tosca's cornice to a hook on a green, white and red lamp post.
  lamp(1010, true); R(1006, TOP - 112, 3, 2, '#1f2a24');
  strand(940, TOP - 153, 1007, TOP - 111, 16, 8, (x, y, k) => {
    const c = ['#2e9d5a', '#f4f1e8', '#e0413a'][k % 3]!, lit = (k + tick) % 4 !== 0;
    R(x, y + 1, 1, 1, '#2a2420');                                                                     // socket
    g.globalAlpha = lit ? 1 : 0.5; R(x - 1, y + 2, 3, 3, c); R(x, y + 5, 1, 1, tone(c, 0.75)); R(x - 1, y + 2, 1, 1, tone(c, 1.6)); g.globalAlpha = 1;
    if (lit) halo(x, y + 3, 2, 4, c);
  });

  // Chinatown: red lanterns from the tip of Li Po's eave to a pole, swaying a pixel.
  post(1404, 186, '#7a2a20');
  strand(1339, TOP - 203, 1404, TOP - 186, 12, 16, (x, y, k) => {
    const s = (k + tick) % 2, lx = x - 3 + s;
    R(x, y + 1, 1, 2, '#3a3330');
    R(lx + 1, y + 3, 5, 1, '#c99a2e'); R(lx, y + 4, 7, 6, '#d0322b'); R(lx + 1, y + 10, 5, 1, '#c99a2e');  // gold caps, round body
    R(lx, y + 4, 1, 6, '#a8241f'); R(lx + 6, y + 4, 1, 6, '#8a1c18'); R(lx + 3, y + 4, 1, 6, '#b82a24');   // ribs
    R(lx + 1, y + 5, 2, 2, '#ff7a5a'); R(lx + 3, y + 11, 1, 2, '#f2c14e'); R(lx + 2, y + 13, 3, 1, '#f2c14e'); // glow and tassel
    halo(lx + 3, y + 7, 4, 7, '#ff9a6a');
  });

  // Hayes Valley: rope and ship lanterns from Smuggler's Cove's roof to a wooden piling.
  post(1840, 150, '#5a3a22');
  strand(1786, TOP - 152, 1840, TOP - 150, 16, 20, (x, y, k) => {
    const on = (k + tick) % 3 !== 0;
    R(x, y + 1, 1, 2, '#333333'); R(x - 1, y + 3, 3, 1, '#2a2420');                                      // hook and cap
    R(x - 2, y + 4, 5, 7, '#2a2420'); R(x - 1, y + 5, 3, 5, on ? '#ffb84a' : '#e09a30'); R(x - 1, y + 5, 1, 2, '#ffe0a0'); // frame, glass
    R(x - 2, y + 11, 5, 1, '#3a2c22');
    if (on) halo(x, y + 7, 3, 7, '#ffcf80');
  });

  // The Mission: papel picado from a pole to Trick Dog's wall, fluttering.
  post(1885, 180, '#4a4a4a');
  const pc = ['#ff4f8b', '#2bb5e0', '#f2c14e', '#7ad36a', '#b07ad8', '#ff8a3a'];
  strand(1885, TOP - 180, 1981, TOP - 188, 10, 10, (x, y, k) => {
    const f = (k + tick) % 2, c = pc[k % pc.length]!;
    R(x - 3, y + 1, 7, 6 - f, c); R(x - 3, y + 1, 7, 1, tone(c, 0.8));                                 // paper, folded over the string
    for (let i = 0; i < 7; i += 2) R(x - 3 + i, y + 7 - f, 1, 1, c);                                  // scalloped edge
    R(x - 2, y + 3, 1, 1, '#fbfaf8'); R(x, y + 3, 1, 2, '#fbfaf8'); R(x + 2, y + 3, 1, 1, '#fbfaf8'); R(x - 1, y + 5 - f, 3, 1, '#fbfaf8'); // cut-outs
  });
  R(1979, TOP - 190, 3, 3, '#3a3330');

  drawCity(g, R, frame, 'front');
}

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;
/**
 * San Francisco itself, kept small: the Golden Gate far off past the Wharf, fog drifting over the Wharf rooftops, and
 * two of Telegraph Hill's parrots on the North Beach lights.
 */
function drawCity(g: CanvasRenderingContext2D, R: Rect, frame: number, layer: 'behind' | 'front') {
  const tick = (frame / 3) | 0;
  if (layer === 'behind') {
    // The Golden Gate, far off beyond the start of the street: its Art Deco tower with stepped crown and portal braces,
    // the deck and its truss, the main cables draping to either side with suspenders, a blinking light on top, over a
    // strip of bay. Drawn pale, since it is far away, and kept left of the cable car.
    const OR = '#d9775a', ORD = '#b35a42', ORL = '#f0a68a', g0 = TOP - 34;
    g.globalAlpha = 0.62;
    R(0, g0, 68, 3, '#9fb8c8'); for (let x = (tick % 4); x < 68; x += 7) R(x, g0 + 1, 3, 1, '#c8dbe6');      // the bay, a wave drifting
    for (const lx of [25, 38]) { R(lx, TOP - 120, 5, 86, OR); R(lx, TOP - 120, 1, 86, ORL); R(lx + 4, TOP - 120, 1, 86, ORD); R(lx + 2, TOP - 116, 1, 80, ORD); } // two legs with a recessed panel
    R(24, TOP - 123, 20, 3, OR); R(24, TOP - 123, 20, 1, ORL); R(26, TOP - 125, 16, 2, OR); R(29, TOP - 127, 10, 2, ORD); // stepped crown
    for (const y of [TOP - 110, TOP - 96, TOP - 82, TOP - 68]) { R(30, y, 8, 3, OR); R(30, y, 8, 1, ORL); R(32, y + 1, 4, 1, ORD); } // portal braces
    R(33, TOP - 130, 2, 2, tick % 4 < 2 ? '#ff4a3a' : '#a83a30');                                                    // aircraft light
    R(0, TOP - 58, 68, 3, OR); R(0, TOP - 58, 68, 1, ORL); R(0, TOP - 55, 68, 1, ORD);                                // the deck
    for (let x = 0; x < 68; x += 2) R(x, TOP - 54 + (x % 4 ? 1 : 0), 1, 1, ORD);                                      // truss beneath it
    const cable = (x0: number, x1: number, y0: number, y1: number) => {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const t = (x - x0) / (x1 - x0), y = Math.round(y0 + (y1 - y0) * (1 - (1 - t) ** 2));  // drops steeply from the tower, then levels
        R(x, y, 1, 1, ORD);
        if (x % 3 === 0 && y < TOP - 59) R(x, y + 1, 1, TOP - 59 - y, 'rgba(179,90,66,0.55)');                       // suspenders
      }
    };
    cable(27, 0, TOP - 121, TOP - 64); cable(41, 67, TOP - 121, TOP - 66);
    g.globalAlpha = 1;
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
}
