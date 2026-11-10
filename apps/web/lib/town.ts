// The town the dinner map is drawn on (public/town/town.png, 768×512 art pixels). Each step of a dinner happens at one
// place in town; its stations are spots on that place's sidewalk. Coordinates are art pixels from the top-left.
export const TOWN = { width: 768, height: 512, src: '/town/town.png' } as const;
/** The trees, split into five layers so groups of trees rustle at different moments instead of all at once. */
export const TREE_LAYERS = [0, 1, 2, 3, 4].map((n) => ({ src: `/town/trees-${n}.png`, every: [7, 9.5, 11, 13, 8.5][n]!, offset: [0, 3.1, 5.7, 1.9, 8.3][n]! }));
/** The bell's frame size in art pixels (public/town/bell-N.png), drawn on the same pixel grid as the town. */
export const BELL_ART = { width: 25, height: 28 } as const;

/** Small living details, in art pixels: the terrace's string lights. */
export const LIFE = {
  bulbs: [[366, 223], [370, 223], [376, 224], [383, 225], [394, 226], [404, 226], [413, 225], [417, 226], [335, 228]] as [number, number][],
};

/** The checkpoint's boom gate: pivot on the yellow post, arm length, and its closed and lifted angles (degrees). */
export const GATE = { x: 439, y: 130.5, length: 63, closed: 7.3, open: -80, light: { x: 433, y: 125 } } as const;
/** The bank's vault wheel (public/town/wheel.png) and the window bar drawn in front of it. */
export const WHEEL = { x: 476, y: 260, size: 39, bar: { x: 494, y: 260, width: 4, height: 39 } } as const;

type Pt = { x: number; y: number };

/** Each step's place, for the image's alt text. The camera frames a step from its walk, so no regions are needed. */
export const PLACES = ['Halden HQ', 'Compliance row', 'The bank (Ramp)', 'The restaurant', 'The phone kiosk', 'The accounting office', 'Parcel depot to the federal building'].map((name) => ({ name }));

/**
 * The bell's tour of town, one leg per step, along the centre lines of the sidewalks and walkways ([x, y, station]).
 * Each leg starts where the previous one ended, so the whole dinner is one continuous walk: HQ, down the compliance
 * spine, the bank, the restaurant, back past the bank to the kiosk, along the bottom row to the federal building.
 */
export const ROUTES: [number, number, 0 | 1][][] = [
  // Top street, left to right: HQ, then the compliance office and the checkpoint.
  [[60, 127, 0], [95, 131, 1], [130, 137, 1], [165, 141, 1], [200, 145, 1], [228, 147, 0]],
  [[260, 151, 1], [295, 155, 1], [330, 159, 1], [370, 164, 1], [455, 168, 1], [530, 177, 1], [612, 183, 0]],
  // Round the corner and back along the middle street, right to left: the bank, then the restaurant.
  [[640, 193, 0], [660, 212, 0], [660, 298, 0], [652, 318, 0], [630, 332, 0], [622, 333, 1], [588, 330, 1], [555, 325, 1], [505, 320, 1]],
  [[415, 313, 1], [350, 305, 1], [280, 298, 1], [200, 288, 1], [150, 284, 0]],
  // Across at the zebra crossing and down to the bottom street: the phone kiosk.
  [[95, 281, 0], [74, 284, 0], [62, 298, 0], [45, 316, 0], [40, 350, 0], [40, 394, 0], [52, 410, 0], [70, 417, 1], [92, 419, 1], [114, 421, 1], [136, 423, 1]],
  // Along the bottom street, left to right: the accounting office, the parcel depot, the federal building.
  [[165, 427, 1], [190, 431, 1], [215, 434, 1], [240, 436, 1], [262, 439, 1], [286, 442, 1]],
  [[325, 446, 1], [358, 451, 1], [374, 459, 0], [395, 464, 0], [462, 468, 0], [486, 461, 0], [560, 467, 1], [612, 473, 1], [690, 481, 0]],
];

/** The whole tour as one path: its points, the length along it at each point, and where each leg starts and ends. */
const TOUR = (() => {
  const pts: Pt[] = [], along: number[] = [], legs: { from: number; to: number; stations: number[] }[] = [];
  for (const leg of ROUTES) {
    const from = along.at(-1) ?? 0, stations: number[] = [];
    for (const [x, y, station] of leg) {
      const last = pts.at(-1);
      along.push(last ? along.at(-1)! + Math.hypot(x - last.x, y - last.y) : 0);
      pts.push({ x, y });
      if (station) stations.push(pts.length - 1);
    }
    legs.push({ from, to: along.at(-1)!, stations });
  }
  return { pts, along, legs, total: along.at(-1)!, d: pts.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' ') };
})();

export type Camera = { x: number; y: number; scale: number };

/** The camera for a step: frames that step's whole walk (from where the bell comes in) and the buildings above it. */
export function camera(step: number, w: number, h: number, overview = false): Camera {
  const leg = ROUTES[step] ?? ROUTES[0]!, prev = ROUTES[step - 1]?.at(-1);
  const xs = [...leg, ...(prev ? [prev] : [])].map((q) => q[0]), ys = [...leg, ...(prev ? [prev] : [])].map((q) => q[1]);
  const [x0, y0, x1, y1] = overview ? [0, 0, TOWN.width, TOWN.height] : [Math.min(...xs) - 40, Math.min(...ys) - 120, Math.max(...xs) + 40, Math.max(...ys) + 28];
  const scale = Math.min(3, (w * 0.92) / (x1 - x0), (h * 0.88) / (y1 - y0));
  return { scale, x: w / 2 - ((x0 + x1) / 2) * scale, y: h / 2 - ((y0 + y1) / 2) * scale };
}

/**
 * Geometry for one step. The path (artD) is the whole tour, the same for every step, so the bell never jumps: it walks
 * from wherever it is to wherever it is going. stops[0] is where this step's leg starts, stops[i + 1] is station i, and
 * the last stop is where the leg ends, all as a percentage of the whole tour. `view` overrides the camera after the
 * viewer drags or zooms.
 */
export function townPath(step: number, count: number, w: number, h: number, overview = false, view?: Camera | null) {
  const cam = view ?? camera(step, w, h, overview), leg = TOUR.legs[step] ?? TOUR.legs[0]!;
  const pct = (l: number) => (l / TOUR.total) * 100;
  // More stations than spots: the extras line up a few steps past the last spot.
  const stations = Array.from({ length: Math.max(1, count) }, (_, i) => {
    const k = leg.stations[Math.min(i, leg.stations.length - 1)]!, extra = Math.max(0, i - leg.stations.length + 1);
    return { x: TOUR.pts[k]!.x + extra * 14, y: TOUR.pts[k]!.y + extra * 3, along: TOUR.along[k]! };
  });
  return {
    points: stations.map((p) => ({ x: cam.x + p.x * cam.scale, y: cam.y + p.y * cam.scale })),
    stops: [pct(leg.from), ...stations.map((s) => pct(s.along)), pct(leg.to)],
    camera: cam,
    artD: TOUR.d,
  };
}
