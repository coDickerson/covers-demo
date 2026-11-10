// The town the dinner map is drawn on (public/town/town.png, 768×512 art pixels). Each step of a dinner happens at one
// place in town; its stations are spots on that place's sidewalk. Coordinates are art pixels from the top-left.
export const TOWN = { width: 768, height: 512, src: '/town/town.png' } as const;
/** The trees, split into five layers so groups of trees rustle at different moments instead of all at once. */
export const TREE_LAYERS = [0, 1, 2, 3, 4].map((n) => ({ src: `/town/trees-${n}.png`, every: [7, 9.5, 11, 13, 8.5][n]!, offset: [0, 3.1, 5.7, 1.9, 8.3][n]! }));
/** The bell's frame size in art pixels (public/town/bell-N.png), drawn on the same pixel grid as the town. */
export const BELL_ART = { width: 25, height: 28 } as const;

/** Small living details, in art pixels: the checkpoint's beacon, the restaurant's string lights, its kitchen vents. */
export const LIFE = {
  beacon: { x: 155, y: 183, size: 4 },
  bulbs: [[528, 285], [533, 285], [538, 285], [543, 284], [548, 283], [553, 286], [558, 287], [564, 289], [570, 291], [575, 292],
    [529, 290], [534, 292], [540, 294], [546, 294], [554, 294], [558, 295], [564, 295], [570, 295], [575, 294]] as [number, number][],
  vents: [{ x: 390, y: 252 }, { x: 412, y: 242 }],
};

/** People at the restaurant, in art pixels (bottom-left of each sprite). One seat at the long table stays empty: the no-show. */
export const PEOPLE = {
  diners: [[496, 338, 0], [506, 334, 1], [516, 331, 2], [526, 328, 3], [535, 326, 4], [497, 350, 5], [509, 347, 1], [519, 344, 3], [530, 341, 0], [572, 327, 2], [588, 330, 4]] as [number, number, number][],
  waiter: { x: 500, y: 372, width: 7, height: 9 },
};

type Pt = { x: number; y: number };
type Place = { name: string; region: [number, number, number, number]; slots: Pt[] };

/** Step index → where it happens, the part of town the camera frames, and the station spots in walking order. */
export const PLACES: Place[] = [
  { name: 'Halden HQ', region: [410, 10, 650, 200], slots: [{ x: 468, y: 160 }, { x: 498, y: 168 }, { x: 532, y: 168 }, { x: 566, y: 158 }] },
  {
    name: 'Compliance row', region: [140, 40, 410, 290],
    slots: [{ x: 205, y: 104 }, { x: 352, y: 98 }, { x: 208, y: 170 }, { x: 348, y: 172 }, { x: 196, y: 242 }, { x: 338, y: 248 }],
  },
  { name: 'The bank (Ramp)', region: [60, 240, 290, 350], slots: [{ x: 104, y: 320 }, { x: 140, y: 328 }, { x: 178, y: 332 }, { x: 216, y: 328 }] },
  { name: 'The restaurant', region: [320, 270, 650, 420], slots: [{ x: 362, y: 372 }, { x: 430, y: 380 }, { x: 538, y: 360 }, { x: 590, y: 374 }] },
  { name: 'The phone kiosk', region: [50, 395, 220, 505], slots: [{ x: 92, y: 470 }, { x: 118, y: 480 }, { x: 146, y: 478 }, { x: 170, y: 468 }] },
  {
    name: 'The accounting office', region: [170, 395, 350, 505],
    slots: [{ x: 200, y: 470 }, { x: 220, y: 480 }, { x: 244, y: 484 }, { x: 268, y: 480 }, { x: 290, y: 472 }, { x: 310, y: 462 }],
  },
  { name: 'Parcel depot to the federal building', region: [330, 385, 720, 505], slots: [{ x: 362, y: 470 }, { x: 410, y: 480 }, { x: 460, y: 478 }, { x: 600, y: 470 }] },
];


/** The camera for a step: scale and offset that frame its place in a w×h viewport. */
export function camera(step: number, w: number, h: number, overview = false) {
  const [x0, y0, x1, y1] = overview ? [0, 0, TOWN.width, TOWN.height] : (PLACES[step] ?? PLACES[0]!).region;
  const scale = Math.min(3.2, (w * 0.9) / (x1 - x0), (h * 0.86) / (y1 - y0));
  return { scale, x: w / 2 - ((x0 + x1) / 2) * scale, y: h / 2 - ((y0 + y1) / 2) * scale };
}

/**
 * Screen geometry for one step, in the same shape as layoutPath: the station points, a path through them that starts
 * where the previous step ended, and each point's position along the path (0–100) for the walker.
 */
export function townPath(step: number, count: number, w: number, h: number, overview = false) {
  const cam = camera(step, w, h, overview), place = PLACES[step] ?? PLACES[0]!;
  const toScreen = (p: Pt) => ({ x: cam.x + p.x * cam.scale, y: cam.y + p.y * cam.scale });
  const slot = (i: number) => place.slots[Math.min(i, place.slots.length - 1)]!;
  const prev = PLACES[step - 1]?.slots.at(-1);
  const startArt = prev ?? { x: slot(0).x - 30, y: slot(0).y + 6 };
  const pts = Array.from({ length: Math.max(1, count) }, (_, i) => {
    const s = slot(i), extra = i >= place.slots.length ? i - place.slots.length + 1 : 0; // more stations than spots: step along
    return toScreen({ x: s.x + extra * 14, y: s.y + extra * 4 });
  });
  const start = toScreen(startArt), last = pts.at(-1)!, end = { x: last.x + 18 * cam.scale, y: last.y };
  const all = [start, ...pts, end];
  // Walk like the town's sidewalks run: along the two isometric directions (2:1 right-down and 2:1 right-up), turning
  // one corner between stops instead of cutting straight across buildings.
  const corner = (a: Pt, b: Pt): Pt => { const dx = b.x - a.x, dy = b.y - a.y, s1 = (dx + 2 * dy) / 4; return { x: a.x + 2 * s1, y: a.y + s1 }; };
  let d = `M${all[0]!.x} ${all[0]!.y}`, length = 0;
  const lengths = [0];
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1]!, b = all[i]!, c = corner(a, b);
    d += ` L${c.x} ${c.y} L${b.x} ${b.y}`;
    length += Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y); lengths.push(length);
  }
  const toArt = (q: { x: number; y: number }) => ({ x: (q.x - cam.x) / cam.scale, y: (q.y - cam.y) / cam.scale });
  const art = all.map(toArt);
  const artD = art.map((q, i) => (i ? `L${corner(art[i - 1]!, q).x} ${corner(art[i - 1]!, q).y} L${q.x} ${q.y}` : `M${q.x} ${q.y}`)).join(' ');
  return { d, points: pts, stops: lengths.map((l) => (length ? (l / length) * 100 : 0)), camera: cam, artD };
}
