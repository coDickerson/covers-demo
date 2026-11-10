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

/**
 * People at the restaurant's long table, in art pixels (bottom-centre of each sprite, sitting on a chair). The far row
 * faces us across the table; the near row has its back to us. One far chair stays empty: the no-show.
 */
export const PEOPLE = {
  far: [[495, 347, 0], [507, 343, 1], [518, 340, 2], [528, 337, 3]] as [number, number, number][],
  near: [[497, 353, 0], [526, 350, 1], [546, 346, 2]] as [number, number, number][],
  waiter: { x: 498, y: 374, width: 10, height: 15 },
};

/**
 * Townsfolk strolling the sidewalks and back (feet at x, y; they walk dx, dy and turn round). Each takes its own time,
 * so they never move in step with each other or the trees.
 */
export const FOLK = [
  { look: 0, x: 432, y: 128, dx: 72, dy: 23, every: 17, delay: 2 },
  { look: 1, x: 296, y: 369, dx: 84, dy: 19, every: 21, delay: 9 },
  { look: 2, x: 352, y: 467, dx: 88, dy: 20, every: 19, delay: 5 },
];

/** Evening light: street lamps (bottom-centre of the post) at the back edge of the sidewalks. */
export const LAMPS: [number, number][] = [[548, 156], [452, 128], [232, 90], [276, 164], [232, 236], [150, 318], [306, 340], [420, 374], [482, 388], [108, 450], [240, 458], [380, 462], [540, 472]];
/** The checkpoint's boom gate: pivot, arm length, and its closed and lifted angles (degrees). */
export const GATE = { x: 181, y: 224, length: 46, closed: -13.5, open: -75 } as const;
/** The bank's vault wheel (public/town/wheel.png) and the window bar drawn in front of it. */
export const WHEEL = { x: 160, y: 289, size: 34, bar: { x: 175, y: 288, width: 3, height: 36 } } as const;

type Pt = { x: number; y: number };

/** Each step's place, for the image's alt text. The camera frames a step from its walk, so no regions are needed. */
export const PLACES = ['Halden HQ', 'Compliance row', 'The bank (Ramp)', 'The restaurant', 'The phone kiosk', 'The accounting office', 'Parcel depot to the federal building'].map((name) => ({ name }));

/**
 * The bell's tour of town, one leg per step, along the centre lines of the sidewalks and walkways ([x, y, station]).
 * Each leg starts where the previous one ended, so the whole dinner is one continuous walk: HQ, down the compliance
 * spine, the bank, the restaurant, back past the bank to the kiosk, along the bottom row to the federal building.
 */
export const ROUTES: [number, number, 0 | 1][][] = [
  [[535, 161, 0], [510, 153, 1], [480, 144, 1], [450, 134, 1], [420, 124, 1], [401, 117, 0], [389, 100, 0]],
  [[340, 94, 0], [300, 86, 0], [270, 80, 0], [259, 82, 0], [222, 104, 0], [188, 103, 1], [222, 104, 0], [259, 84, 0], [322, 90, 1], [259, 84, 0],
    [259, 160, 0], [232, 172, 0], [196, 180, 1], [232, 172, 0], [259, 160, 0], [300, 165, 1], [259, 162, 0], [259, 238, 0], [215, 242, 1], [259, 238, 0], [296, 243, 1]],
  [[259, 239, 0], [276, 262, 0], [276, 360, 0], [232, 354, 1], [204, 345, 1], [176, 340, 1], [150, 334, 1]],
  [[200, 344, 0], [276, 364, 0], [345, 378, 1], [395, 391, 1], [440, 401, 1], [482, 407, 1]],
  [[440, 401, 0], [360, 383, 0], [276, 364, 0], [200, 344, 0], [146, 336, 0], [152, 394, 0], [160, 452, 0], [150, 459, 0], [140, 463, 1], [125, 466, 1], [110, 462, 1], [96, 457, 1]],
  [[125, 466, 0], [150, 459, 0], [170, 456, 0], [188, 461, 1], [210, 466, 1], [232, 470, 1], [254, 475, 1], [266, 478, 0], [280, 472, 1], [300, 462, 1]],
  [[334, 464, 0], [360, 468, 1], [410, 479, 1], [452, 488, 1], [484, 489, 0], [524, 470, 0], [545, 475, 0], [585, 482, 1], [600, 489, 0]],
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
  const [x0, y0, x1, y1] = overview ? [0, 0, TOWN.width, TOWN.height] : [Math.min(...xs) - 40, Math.min(...ys) - 85, Math.max(...xs) + 40, Math.max(...ys) + 30];
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
