// Schemas for the synthetic receipt eval set: the hand-written specs and the generated manifest.
// Ground-truth lines use the contract's ReceiptLine shape minus `confidence`.
import { z } from 'zod';
import { Cents, ReceiptLine } from '@covers/contract';

export const Category = ReceiptLine.shape.category;
export type Category = z.infer<typeof Category>;
export const CATEGORIES = Category.options;

export const HardCase = z.enum([
  'seed_clean', // plan's clean sample: $612.00, 6 covers, exactly one wine line
  'seed_hard', // plan's hard sample: blurry, "Beverages" line that is alcohol
  'alcohol_vague_name', // "Beverages", "Bar", "BEV 2"
  'alcohol_wine_by_name', // "Caymus Cab", "Sancerre" — no word "wine"
  'alcohol_cocktail_by_name', // "Negroni", "Old Fashioned"
  'alcohol_beer_brand', // "Modelo", "Stella"
  'na_lookalike', // sparkling water, NA spritz, mocktail, NA beer — must NOT be alcohol
  'liquor_tax', // "Liquor Tax" is tax, not alcohol
  'service_charge', // fee that is not a tip
  'auto_gratuity', // auto-grat is a fee; a separate tip may exist
  'discount_comp', // negative amounts, category other
  'covers_mismatch', // printed covers != expected headcount
  'prompt_injection', // instructions inside receipt text; ground truth ignores them
  'long_receipt', // 20+ ground-truth lines
  'short_receipt', // 3 ground-truth lines
  'handwritten_tip', // tip and total written in script
  'no_printed_covers', // receipt never prints a guest count
  'heavy_degradation', // deliberately hard image
]);
export type HardCase = z.infer<typeof HardCase>;

export const Template = z.enum(['thermal', 'upscale', 'bartab', 'handwritten']);
export type Template = z.infer<typeof Template>;

export const SpecItem = z.object({
  text: z.string().min(1),
  qty: z.number().int().positive().optional(),
  amountCents: Cents, // extended amount for the line (qty × unit); negative for discounts
  category: Category,
  note: z.string().optional(), // printed modifier under the item ("MED RARE"); display only, not part of ground-truth text
});
export type SpecItem = z.infer<typeof SpecItem>;

export const Charge = z.object({ text: z.string().min(1), amountCents: Cents });
export type Charge = z.infer<typeof Charge>;

export const DegradeParams = z.object({
  blurSigma: z.number().min(0), // 0 = none
  rotateDeg: z.number(),
  skewX: z.number(), // shear factor, small (e.g. 0.03)
  glare: z.number().min(0).max(1), // peak opacity of the bright overlay
  fade: z.number().min(0).max(1), // 0 = full contrast, 1 = washed out
  noise: z.number().min(0), // stddev of per-pixel noise, 0..255 scale
  jpegQuality: z.number().int().min(1).max(100),
});
export type DegradeParams = z.infer<typeof DegradeParams>;

export const ReceiptSpec = z.object({
  id: z.string().regex(/^r\d{2}-[a-z0-9-]+$/),
  template: Template,
  restaurant: z.object({ name: z.string(), address: z.array(z.string()).min(1), phone: z.string().optional() }),
  date: z.iso.date(),
  time: z.string().regex(/^\d{1,2}:\d{2} (AM|PM)$/),
  server: z.string(),
  table: z.string().optional(),
  check: z.string(),
  printedCovers: z.number().int().positive().optional(),
  expectedHeadcount: z.number().int().positive(), // who the scenario says ate; differs from printedCovers when tagged covers_mismatch
  items: z.array(SpecItem).min(1), // food/alcohol/other lines, discounts included
  fees: z.array(Charge).default([]), // service charge, auto-gratuity, surcharges — category fee
  taxes: z.array(Charge).default([]),
  tip: Charge.optional(), // printed or handwritten; category tip
  totalCents: Cents, // the printed (or written-in) total
  footer: z.array(z.string()).default([]),
  degrade: DegradeParams.partial().optional(),
  tags: z.array(HardCase).min(1),
});
export type ReceiptSpecInput = z.input<typeof ReceiptSpec>;
export type ReceiptSpec = z.infer<typeof ReceiptSpec>;

export const TruthLine = ReceiptLine.omit({ confidence: true });
export type TruthLine = z.infer<typeof TruthLine>;

export const GroundTruth = z.object({
  lines: z.array(TruthLine).min(1),
  totalCents: Cents,
  printedCovers: z.number().int().positive().optional(),
  expectedHeadcount: z.number().int().positive(),
});
export type GroundTruth = z.infer<typeof GroundTruth>;

export const ManifestEntry = z.object({
  id: z.string(),
  template: Template,
  restaurant: z.string(),
  tags: z.array(HardCase),
  images: z.object({ clean: z.string(), degraded: z.string() }), // paths relative to the manifest
  degrade: DegradeParams,
  truth: GroundTruth,
});
export type ManifestEntry = z.infer<typeof ManifestEntry>;

export const Manifest = z.object({
  version: z.literal(1),
  seed: z.string(),
  receipts: z.array(ManifestEntry),
});
export type Manifest = z.infer<typeof Manifest>;
