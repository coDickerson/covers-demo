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
  waiter: { x: 500, y: 372, width: 7, height: 9 },
};

/** Evening light: street lamps (bottom-centre of the post) at the back edge of the sidewalks. */
export const LAMPS: [number, number][] = [[548, 156], [452, 128], [232, 90], [276, 164], [232, 236], [150, 318], [306, 340], [420, 374], [482, 388], [108, 450], [240, 458], [380, 462], [540, 472]];
/** The checkpoint's boom gate: pivot, arm length, and its closed and lifted angles (degrees). */
export const GATE = { x: 181, y: 224, length: 46, closed: -13.5, open: -75 } as const;
/** The bank's vault wheel (public/town/wheel.png) and the window bar drawn in front of it. */
export const WHEEL = { x: 160, y: 289, size: 34, bar: { x: 175, y: 288, width: 3, height: 36 } } as const;

type Pt = { x: number; y: number };
type Place = { name: string; region: [number, number, number, number] };

/** Step index → where it happens, the part of town the camera frames, and the station spots in walking order. */
export const PLACES: Place[] = [
  { name: 'Halden HQ', region: [390, 70, 650, 200] },
  { name: 'Compliance row', region: [140, 40, 410, 290] },
  { name: 'The bank (Ramp)', region: [60, 230, 360, 350] },
  { name: 'The restaurant', region: [180, 290, 560, 420] },
  { name: 'The phone kiosk', region: [50, 320, 470, 505] },
  { name: 'The accounting office', region: [60, 395, 350, 505] },
  { name: 'Parcel depot to the federal building', region: [300, 385, 720, 505] },
];

/**
 * The walk for each step, along the town's sidewalks: [x, y, station]. A station point is where a check happens; the
 * others are corners. Each step's walk starts where the previous one ended.
 */
export const ROUTES: [number, number, 0 | 1][][] = [
  [[560, 165, 0], [530, 156, 1], [500, 147, 1], [470, 138, 1], [440, 129, 1], [400, 118, 0]],
  [[300, 97, 0], [212, 98, 1], [342, 100, 1], [262, 100, 0], [262, 168, 0], [212, 170, 1], [342, 172, 1], [256, 172, 0], [256, 244, 0], [212, 244, 1], [340, 246, 1]],
  [[288, 248, 0], [288, 328, 0], [232, 330, 1], [200, 329, 1], [168, 328, 1], [138, 327, 1]],
  [[200, 330, 0], [252, 336, 0], [300, 352, 0], [340, 368, 1], [400, 380, 1], [455, 392, 1], [505, 400, 1]],
  [[455, 392, 0], [300, 352, 0], [252, 336, 0], [148, 336, 0], [154, 390, 0], [160, 452, 0], [140, 458, 1], [118, 462, 1], [98, 462, 1], [84, 458, 1]],
  [[120, 462, 0], [165, 462, 0], [188, 464, 1], [210, 467, 1], [232, 469, 1], [254, 469, 1], [276, 467, 1], [298, 464, 1]],
  [[330, 464, 0], [352, 467, 1], [400, 474, 1], [450, 478, 1], [505, 478, 0], [600, 482, 1]],
];



export type Camera = { x: number; y: number; scale: number };

/** The camera for a step: scale and offset that frame its place in a w×h viewport. */
export function camera(step: number, w: number, h: number, overview = false): Camera {
  const [x0, y0, x1, y1] = overview ? [0, 0, TOWN.width, TOWN.height] : (PLACES[step] ?? PLACES[0]!).region;
  const scale = Math.min(3.2, (w * 0.9) / (x1 - x0), (h * 0.86) / (y1 - y0));
  return { scale, x: w / 2 - ((x0 + x1) / 2) * scale, y: h / 2 - ((y0 + y1) / 2) * scale };
}

/**
 * Screen geometry for one step: the station points, the walk through them along the sidewalks (starting where the
 * previous step ended), and each station's position along the walk (0–100). stops[0] is the start, stops[i + 1] is
 * station i, and the walk's end is 100. `view` overrides the camera when the viewer has dragged or zoomed the town.
 */
export function townPath(step: number, count: number, w: number, h: number, overview = false, view?: Camera | null) {
  const cam = view ?? camera(step, w, h, overview), route = ROUTES[step] ?? ROUTES[0]!;
  const art: Pt[] = [...(step > 0 ? [ROUTES[step - 1]!.at(-1)!] : []), ...route].map(([x, y]) => ({ x, y }));
  const at = [0];
  for (let i = 1; i < art.length; i++) at.push(at[i - 1]! + Math.hypot(art[i]!.x - art[i - 1]!.x, art[i]!.y - art[i - 1]!.y));
  const total = at.at(-1) || 1, offset = step > 0 ? 1 : 0;
  const spots = route.flatMap(([x, y, s], i) => (s ? [{ x, y, along: at[i + offset]! }] : []));
  // More stations than spots: the extras line up a few steps past the last spot, along the sidewalk.
  const stations = Array.from({ length: Math.max(1, count) }, (_, i) => {
    const s = spots[Math.min(i, spots.length - 1)]!, extra = Math.max(0, i - spots.length + 1);
    return { x: s.x + extra * 14, y: s.y + extra * 2, along: Math.min(total, s.along + extra * 14) };
  });
  const toScreen = (p: Pt) => ({ x: cam.x + p.x * cam.scale, y: cam.y + p.y * cam.scale });
  const artD = art.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' ');
  return {
    points: stations.map(toScreen),
    stops: [0, ...stations.map((s) => (s.along / total) * 100), 100],
    camera: cam,
    artD,
  };
}
