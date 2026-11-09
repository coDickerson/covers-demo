import type { Attendance, Hcp, ProgramPlan, Receipt, Speaker } from '@covers/contract';
import type { CustomPack } from './custom';

export const PACK_IDS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
export type PackId = (typeof PACK_IDS)[number];

/** Year-to-date spend for one HCP, computed by the caller from the ledger. */
export type LedgerEntry = {
  npi: string; ytdCents: number; capCents?: number;
  /** Same-topic programs in the last 12 months not present in `history` (e.g. from seed data). Added to the history count. */
  sameTopicCount12mo?: number;
};

/** One past program an HCP attended. Used for repeat-attendance (P5). */
export type AttendanceHistory = { npi: string; topic: string; date: string; planId: string };

/** A human approval of a flagged check. Blocks are never approvable. */
export type Approval = { checkId: string; by: string; note: string; at: string };

export type EngineSettings = {
  /** P3: all-in per-person cap (food + beverage + tax + tip). */
  perPersonCapCents: number;
  /** P4: default annual cap per HCP; a LedgerEntry.capCents overrides it. */
  defaultAnnualCapCents: number;
  /** P4: "near" when projected is above nearNumerator/nearDenominator of the cap. */
  nearNumerator: number;
  nearDenominator: number;
  /** P5: flag when an HCP already attended this many same-topic programs in the last 12 months. */
  repeatTopicThreshold: number;
  /** Receipt lines below this confidence go back to the rep for a one-tap fix. */
  confidenceGate: number;
  /** Lines + tax + tip must equal the printed total within this many cents. */
  reconcileToleranceCents: number;
  /** P6: CMS Open Payments thresholds for the program year. */
  openPayments: { programYear: number; smallPaymentCents: number; aggregateCents: number };
  enabledPacks: readonly PackId[];
};

export type EvaluateInput = {
  plan: ProgramPlan;
  /** The roster entry for plan.speakerId, or null if it is not on the roster. */
  speaker: Speaker | null;
  /** Every HCP the caller could resolve (seed + registry lookups). */
  hcps: Hcp[];
  ledger: LedgerEntry[];
  history: AttendanceHistory[];
  approvals?: Approval[];
  /** Flags compliance denied. Same shape as approvals; a denied flag blocks the plan until the plan changes. */
  denials?: Approval[];
  settings?: Partial<EngineSettings>;
  /** Promoted Pack-lab packs (A7), applied after P1–P6. */
  customPacks?: CustomPack[];
  /** Caller-supplied clock, so the engine stays pure. ISO datetime. */
  now: string;
};

export type SettleInput = Omit<EvaluateInput, 'approvals'> & { receipt: Receipt; attendance: Attendance };
