// Deterministic "phone photo" degradation of a clean receipt render.
// Seeded per receipt: same seed + same input PNG + same sharp/libvips version => same bytes.
import sharp, { type OutputInfo, type Sharp } from 'sharp';
import { DegradeParams } from './schema';

/** mulberry32 — tiny seeded PRNG. Returns floats in [0, 1). */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 'covers-receipts-v1'; // bump to regenerate a different but still deterministic set

const round = (x: number, dp = 3) => Math.round(x * 10 ** dp) / 10 ** dp;

/** Moderate, varied defaults drawn from the seed; spec overrides win. */
export function degradeParams(seed: string, overrides: Partial<DegradeParams> = {}): DegradeParams {
  const r = rng(`${seed}:params`);
  const between = (lo: number, hi: number) => lo + (hi - lo) * r();
  const sign = () => (r() < 0.5 ? -1 : 1);
  const p: DegradeParams = {
    blurSigma: round(between(0.5, 1.3)),
    rotateDeg: round(sign() * between(0.4, 2.8)),
    skewX: round(sign() * between(0.01, 0.045)),
    glare: round(between(0.15, 0.45)),
    fade: round(between(0.05, 0.4)),
    noise: round(between(3, 9)),
    jpegQuality: Math.round(between(45, 72)),
  };
  return DegradeParams.parse({ ...p, ...overrides });
}

const TABLE = { r: 74, g: 58, b: 46 }; // dark wood the receipt sits on
const PAPER_TINT = '#f3eddc'; // thermal paper warmth, multiplied over the render

async function raw(img: Sharp) {
  return img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

function fromRaw(data: Buffer, info: OutputInfo) {
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

export async function degrade(cleanPng: Buffer, params: DegradeParams, seed: string): Promise<Buffer> {
  const r = rng(`${seed}:pixels`);
  const meta = await sharp(cleanPng).metadata();
  const w = meta.width!;
  const h = meta.height!;

  // 1. Fade: compress contrast toward white (thermal fade), then warm paper tint.
  const a = 1 - params.fade * 0.6;
  let img = sharp(cleanPng).removeAlpha().linear(a, 255 * (1 - a));
  let step = await raw(img);
  img = fromRaw(step.data, step.info).composite([
    { input: { create: { width: w, height: h, channels: 3, background: PAPER_TINT } }, blend: 'multiply' },
  ]);

  // 2. Glare: bright radial blob somewhere on the paper.
  if (params.glare > 0) {
    const cx = Math.round(w * (0.2 + 0.6 * r()));
    const cy = Math.round(h * (0.15 + 0.7 * r()));
    const rad = Math.round(Math.max(w, h) * (0.18 + 0.2 * r()));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><radialGradient id="g" cx="${cx}" cy="${cy}" r="${rad}" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#fff" stop-opacity="${params.glare}"/>
<stop offset="0.45" stop-color="#fff" stop-opacity="${round(params.glare * 0.55)}"/>
<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    step = await raw(img);
    img = fromRaw(step.data, step.info).composite([{ input: Buffer.from(svg), blend: 'over' }]);
  }

  // 3. Sensor noise (seeded, approx. gaussian via sum of uniforms).
  step = await raw(img);
  if (params.noise > 0) {
    const d = step.data;
    for (let i = 0; i < d.length; i += step.info.channels) {
      const n = (r() + r() + r() - 1.5) * 2 * params.noise;
      for (let c = 0; c < step.info.channels; c++) d[i + c] = Math.max(0, Math.min(255, d[i + c]! + n));
    }
  }

  // 4. Sit it on a table, shear, rotate.
  const margin = Math.round(Math.max(w, h) * 0.04);
  step = await raw(
    fromRaw(step.data, step.info).extend({ top: margin, bottom: margin, left: margin, right: margin, background: TABLE }),
  );
  if (params.skewX !== 0) {
    step = await raw(fromRaw(step.data, step.info).affine([1, params.skewX, 0, 1], { background: TABLE, interpolator: 'bilinear' }));
  }
  if (params.rotateDeg !== 0) {
    step = await raw(fromRaw(step.data, step.info).rotate(params.rotateDeg, { background: TABLE }));
  }

  // 5. Focus blur, then JPEG compression.
  let out = fromRaw(step.data, step.info);
  if (params.blurSigma >= 0.3) out = out.blur(params.blurSigma);
  return out.jpeg({ quality: params.jpegQuality, chromaSubsampling: '4:2:0' }).toBuffer();
}
