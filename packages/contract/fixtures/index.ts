// Seed data for the scripted scenario. Every person and company here is fictional.
// Fake NPIs start with 9 (real NPIs start with 1 or 2), so they can never match a real doctor.
// Parsed with the contract schemas at import time, so a bad edit fails loudly.
import { z } from 'zod';
import { Cents, Citation, Hcp, PolicyDocument, ProgramPlan, ProofBundle, Receipt, Rep, RulePack, Speaker } from '../src/types';
import companyJson from './company.json';
import usersJson from './users.json';
import repsJson from './reps.json';
import speakersJson from './speakers.json';
import hcpsJson from './hcps.json';
import ledgerJson from './ledger.json';
import plansJson from './plans.json';
import receiptsJson from './receipts.json';
import packsJson from './packs.json';
import citationsJson from './citations.json';
import proofJson from './proof.placeholder.json';
import documentsJson from './documents.json';

// Fixture-only shapes (not part of CoversService).
export const Company = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  perPersonCapCents: Cents,
  annualCapCents: Cents, // applied to each HCP separately
  nearThresholdPct: z.number(),
  repeatTopicFlagAt: z.number().int(), // flag when prior same-topic programs in 12 months >= this
});
export type Company = z.infer<typeof Company>;

export const User = z.object({ id: z.string(), name: z.string(), role: z.enum(['rep', 'compliance', 'manager']) });
export type User = z.infer<typeof User>;

export const LedgerSeed = z.object({ npi: z.string(), ytdCents: Cents, sameTopicCount12mo: z.number().int().nonnegative() });
export type LedgerSeed = z.infer<typeof LedgerSeed>;

const { _note: _citationsNote, ...citationsByPack } = citationsJson;

export const fixtures = {
  company: Company.parse(companyJson),
  users: z.array(User).parse(usersJson),
  reps: z.array(Rep).parse(repsJson),
  speakers: z.array(Speaker).parse(speakersJson),
  hcps: z.array(Hcp).parse(hcpsJson),
  ledger: z.array(LedgerSeed).parse(ledgerJson),
  plans: z.array(ProgramPlan).parse(plansJson),
  sampleReceipts: z.array(Receipt).parse(receiptsJson),
  packs: z.array(RulePack).parse(packsJson),
  citations: z.record(z.string(), Citation).parse(citationsByPack),
  proof: ProofBundle.parse(proofJson),
  documents: z.array(PolicyDocument).parse(documentsJson), // added Nov 8: sources citations point to
} as const;

export type Fixtures = typeof fixtures;

/** A fresh deep copy of the seed, for a new or reset session. */
export function cloneSeed(): Fixtures {
  return structuredClone(fixtures);
}

/** Well-known ids used by the scripted scenario and the contract tests. */
export const IDS = {
  rep: 'rep-jordan-lee',
  compliance: 'cmp-priya-shah',
  manager: 'mgr-morgan-reyes',
  demoPlan: 'plan-demo',
  patelSpeaker: 'spk-patel',
  ortwellSpeaker: 'spk-ortwell',
  patel: '9000000101',
  ortwell: '9000000102',
  ruvane: '9000000001',
  kinsale: '9000000002',
  okafor: '9000000003',
  lindqvist: '9000000004',
  brennick: '9000000005',
  ellery: '9000000006',
  cleanReceipt: 'sample-clean',
  hardReceipt: 'sample-hard',
} as const;
