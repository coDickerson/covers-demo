// Engine-local copy of the scripted Halden Medical scenario (docs/decisions.md).
// Every person is fictional. The joint seed lives in packages/contract/fixtures (Cole, C0);
// these tests pin the numbers the engine must produce from that story.
import type { Attendance, Hcp, ProgramPlan, Receipt, Speaker } from '@covers/contract';
import type { AttendanceHistory, LedgerEntry } from '../src/index';

export const NOW = '2026-11-08T12:00:00-08:00';

const hcp = (npi: string, name: string, specialty: string, recipientType: Hcp['recipientType'] = 'physician', credential = 'MD'): Hcp => ({
  npi, name, credential, specialty, state: 'CA', recipientType, source: 'seed',
});

export const PATEL = hcp('1000000101', 'Dr. Marcus Patel', 'Interventional Cardiology');
export const ORTIZ = hcp('1000000102', 'Dr. Lena Ortiz', 'Cardiology');
export const RUIZ = hcp('1000000201', 'Dr. Ana Ruiz', 'Cardiology');
export const KIM = hcp('1000000202', 'Dr. Grace Kim', 'Vascular Surgery');
export const CHEN = hcp('1000000203', 'Dr. Wei Chen', 'Interventional Cardiology');
export const OKAFOR = hcp('1000000204', 'Dr. Emeka Okafor', 'Cardiology');
export const NGUYEN = hcp('1000000205', 'Dr. Linh Nguyen', 'Internal Medicine');
export const BAKER = hcp('1000000206', 'Sam Baker', 'Cardiology', 'nurse_practitioner', 'NP');

export const HCPS: Hcp[] = [PATEL, ORTIZ, RUIZ, KIM, CHEN, OKAFOR, NGUYEN, BAKER];

export const SPEAKER_PATEL: Speaker = {
  id: 'spk-patel', hcp: PATEL, status: 'approved', approvedTopics: ['Catheter outcomes'], contractEnds: '2027-06-30',
};
export const SPEAKER_ORTIZ: Speaker = {
  id: 'spk-ortiz', hcp: ORTIZ, status: 'training_expired', approvedTopics: ['Catheter outcomes'], contractEnds: '2027-06-30',
};

export const LEDGER: LedgerEntry[] = [
  { npi: RUIZ.npi, ytdCents: 194_000 },
  { npi: KIM.npi, ytdCents: 52_000 },
  { npi: CHEN.npi, ytdCents: 30_000 },
  { npi: OKAFOR.npi, ytdCents: 0 },
  { npi: NGUYEN.npi, ytdCents: 81_000 },
  { npi: BAKER.npi, ytdCents: 12_000 },
  { npi: PATEL.npi, ytdCents: 40_000 },
];

export const HISTORY: AttendanceHistory[] = [
  { npi: RUIZ.npi, topic: 'Catheter outcomes', date: '2026-03-12', planId: 'past-1' },
  { npi: RUIZ.npi, topic: 'catheter outcomes ', date: '2026-08-20', planId: 'past-2' },
  { npi: NGUYEN.npi, topic: 'Catheter outcomes', date: '2026-05-02', planId: 'past-3' },
  { npi: CHEN.npi, topic: 'Catheter outcomes', date: '2025-09-01', planId: 'past-4' }, // > 12 months before the dinner
  { npi: CHEN.npi, topic: 'Catheter outcomes', date: '2026-05-02', planId: 'past-3' },
  { npi: KIM.npi, topic: 'Stent sizing', date: '2026-06-10', planId: 'past-5' },
];

export const PLAN: ProgramPlan = {
  id: 'plan-1',
  title: 'Speaker dinner: Dr. Patel on catheter outcomes',
  purpose: 'Peer education on catheter outcomes data',
  topic: 'Catheter outcomes',
  repId: 'rep-jordan',
  speakerId: 'spk-patel',
  venue: 'Nopa, San Francisco',
  date: '2026-11-12T19:00:00-08:00',
  inviteeNpis: [RUIZ.npi, KIM.npi, CHEN.npi, OKAFOR.npi, NGUYEN.npi, BAKER.npi],
  employeeCount: 1,
  estimatedPerPerson: 11_000,
  status: 'draft',
};

export const PLAN_WITHOUT_RUIZ: ProgramPlan = { ...PLAN, inviteeNpis: PLAN.inviteeNpis.filter((n) => n !== RUIZ.npi) };

// The clean sample receipt: $612.00 for 6 covers, one wine line.
export const CLEAN_RECEIPT: Receipt = {
  id: 'rcpt-clean',
  planId: 'plan-1',
  imageUrl: 'sample://clean',
  totalCents: 61_200,
  printedCovers: 6,
  lines: [
    { id: 'l1', text: 'Prix fixe dinner x6', amountCents: 39_000, category: 'food', confidence: 0.98 },
    { id: 'l2', text: 'Sancerre btl', amountCents: 6_800, category: 'alcohol', confidence: 0.95 },
    { id: 'l3', text: 'Sparkling water x3', amountCents: 1_800, category: 'food', confidence: 0.93 },
    { id: 'l4', text: 'Tax', amountCents: 4_200, category: 'tax', confidence: 0.99 },
    { id: 'l5', text: 'Tip', amountCents: 9_400, category: 'tip', confidence: 0.97 },
  ],
};

// Dr. Kim no-shows: 4 invitees + Dr. Patel + Jordan = 6 who ate.
export const ATTENDANCE: Attendance = {
  planId: 'plan-1',
  attendedNpis: [PATEL.npi, CHEN.npi, OKAFOR.npi, NGUYEN.npi, BAKER.npi],
  employeesPresent: 1,
  extraGuests: 0,
  confirmedBy: 'rep-jordan',
};

export const baseInput = (plan: ProgramPlan = PLAN, speaker: Speaker | null = SPEAKER_PATEL) => ({
  plan, speaker, hcps: HCPS, ledger: LEDGER, history: HISTORY, now: NOW,
});
