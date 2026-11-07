// pnpm --filter @covers/evals receipts:build
// Renders every spec to PNG with Playwright (chromium), degrades it with sharp (seeded), and writes
// out/<id>/{clean.png,degraded.jpg}, out/manifest.json (Zod-validated) and out/contact-sheet.png.
// If chromium is missing: pnpm --filter @covers/evals exec playwright install chromium
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { SEED, degrade, degradeParams } from './degrade';
import { Manifest, type ManifestEntry } from './schema';
import { SPECS } from './specs';
import { renderHtml } from './templates';
import { groundTruth } from './truth';


const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
const SCALE = 2; // device pixel ratio for the render; phone-photo-ish resolution

async function contactSheet(entries: ManifestEntry[]): Promise<Buffer> {
  const cols = 5;
  const cellW = 260;
  const imgH = 460;
  const labelH = 24;
  const pad = 10;
  const rows = Math.ceil(entries.length / cols);
  const W = cols * (cellW + pad) + pad;
  const H = rows * (imgH + labelH + pad) + pad;
  const tiles = await Promise.all(
    entries.map(async (e, i) => {
      const x = pad + (i % cols) * (cellW + pad);
      const y = pad + Math.floor(i / cols) * (imgH + labelH + pad);
      const thumb = await sharp(join(OUT, e.images.degraded))
        .resize(cellW, imgH, { fit: 'contain', background: '#222' })
        .png()
        .toBuffer();
      const label = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${labelH}"><text x="4" y="17" font-family="Menlo, monospace" font-size="13" fill="#eee">${e.id}</text></svg>`,
      );
      return [
        { input: thumb, left: x, top: y },
        { input: label, left: x, top: y + imgH },
      ];
    }),
  );
  return sharp({ create: { width: W, height: H, channels: 3, background: '#111' } })
    .composite(tiles.flat())
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch().catch((err: unknown) => {
    console.error('Could not launch chromium. Run: pnpm --filter @covers/evals exec playwright install chromium');
    throw err;
  });
  const page = await browser.newPage({ deviceScaleFactor: SCALE, viewport: { width: 800, height: 800 } });

  const entries: ManifestEntry[] = [];
  try {
    for (const spec of SPECS) {
      await page.setContent(renderHtml(spec), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.locator('.receipt').screenshot({ type: 'png', animations: 'disabled' });
      const clean = await sharp(shot).removeAlpha().png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer();

      const seed = `${SEED}:${spec.id}`;
      const params = degradeParams(seed, spec.degrade);
      const degraded = await degrade(clean, params, seed);

      const dir = join(OUT, spec.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'clean.png'), clean);
      await writeFile(join(dir, 'degraded.jpg'), degraded);

      entries.push({
        id: spec.id,
        template: spec.template,
        restaurant: spec.restaurant.name,
        tags: spec.tags,
        images: { clean: `${spec.id}/clean.png`, degraded: `${spec.id}/degraded.jpg` },
        degrade: params,
        truth: groundTruth(spec),
      });
      console.log(`${spec.id}  clean ${(clean.length / 1024).toFixed(0)} KB  degraded ${(degraded.length / 1024).toFixed(0)} KB`);
    }
  } finally {
    await browser.close();
  }

  const manifest = Manifest.parse({ version: 1, seed: SEED, receipts: entries });
  await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(OUT, 'contact-sheet.png'), await contactSheet(entries));
  console.log(`\n${entries.length} receipts -> ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
