import { PACK_IDS, type EngineSettings } from './types';

export const DEFAULT_SETTINGS: EngineSettings = {
  perPersonCapCents: 12_500, // $125, decisions.md
  defaultAnnualCapCents: 200_000, // $2,000, decisions.md
  nearNumerator: 4,
  nearDenominator: 5, // near = above 80%
  repeatTopicThreshold: 2, // a third same-topic program in 12 months is flagged
  confidenceGate: 0.8,
  reconcileToleranceCents: 1,
  // CMS Open Payments, program year 2026: $13.82 per payment, $138.13 aggregate.
  // Source: cms.gov/openpayments/program-participants/reporting-entities/data-collection (checked Nov 7 and Nov 8 2026).
  openPayments: { programYear: 2026, smallPaymentCents: 1_382, aggregateCents: 13_813 },
  enabledPacks: PACK_IDS,
};

export function resolveSettings(partial: Partial<EngineSettings> | undefined): EngineSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}
