import type { Citation } from '@covers/contract';
import type { PackId } from './types';

// Every rule result carries one of these (CLAUDE.md rule 3). Sources follow the rule-pack table in
// docs/implementation.md. Each rule points to a stored document and passage (packages/contract/fixtures/documents.json),
// whose government texts were checked against the originals on Nov 8 2026.
const VERSION = '2026-11-08.2';

// HHS-OIG Special Fraud Alert: Speaker Programs, Nov 16 2020 (covers pharmaceutical and medical device companies).
const OIG_SPEAKER_ALERT = 'https://oig.hhs.gov/documents/special-fraud-alerts/865/SpecialFraudAlertSpeakerPrograms.pdf';
// Program-year thresholds ($13.82 / $138.13 for PY2026).
const CMS_OPEN_PAYMENTS = 'https://www.cms.gov/openpayments/program-participants/reporting-entities/data-collection';
// Covered recipient definitions (physicians and non-physician practitioners).
const CMS_GLOSSARY = 'https://www.cms.gov/priorities/key-initiatives/open-payments/glossary-acronyms';
// 42 CFR 403.904(g)(1): food and beverage in a group setting.
const CFR_403_904 = 'https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-A/part-403/subpart-I/section-403.904';
// Cal. Health & Safety Code 119402(d)(1). Applies to prescription devices through the definitions in 119400(a)(2) and (c).
const CA_HSC_119402 = 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=119402';

type Rule = { pack: PackId; label: string; url: string | undefined; doc: string; passage: string };

const RULES = {
  'P1.speaker-status': { pack: 'P1', label: 'Halden Medical policy §1: only approved, trained speakers under an active contract (fictional company policy)', url: undefined, doc: 'halden-policy', passage: 's1-speakers' },
  'P1.topic': { pack: 'P1', label: 'Halden Medical policy §1: speakers present only topics they are approved for (fictional company policy)', url: undefined, doc: 'halden-policy', passage: 's1-speakers' },
  'P1.contract-active': { pack: 'P1', label: 'Halden Medical policy §1: speaker contract active on the program date (fictional company policy)', url: undefined, doc: 'halden-policy', passage: 's1-speakers' },
  'P2.identity': { pack: 'P2', label: 'CMS Open Payments: covered recipients are physicians and non-physician practitioners, each identified by NPI and type', url: CMS_GLOSSARY, doc: 'cms-glossary', passage: 'covered-recipients' },
  'P2.duplicate-invitee': { pack: 'P2', label: 'CMS Open Payments: each covered recipient identified once, by NPI', url: CMS_GLOSSARY, doc: 'cms-glossary', passage: 'npi' },
  'P2.uninvited': { pack: 'P2', label: '42 CFR 403.904(g)(1): value is reported for covered recipients who actually ate, so everyone who ate must be identified', url: CFR_403_904, doc: 'cfr-403-904', passage: 'g1' },
  'P3.per-person-estimate': { pack: 'P3', label: 'Halden Medical policy §2: $125 all-in per person for out-of-office dinners (fictional company policy; common industry control)', url: 'https://guidehouse.com/-/media/www/site/insights/life-sciences/2018/physician-feed-thysef.pdf', doc: 'halden-policy', passage: 's2-meals' },
  'P3.per-person-actual': { pack: 'P3', label: 'Halden Medical policy §2: actual per-person cost over the cap goes to compliance (fictional company policy)', url: undefined, doc: 'halden-policy', passage: 's2-meals' },
  'P4.annual-cap': { pack: 'P4', label: 'Cal. Health & Safety Code §119402(d)(1): a specific annual dollar limit per health care professional ($2,000, Halden Medical)', url: CA_HSC_119402, doc: 'ca-hsc-119402', passage: 'd1' },
  'P5.repeat-attendance': { pack: 'P5', label: 'HHS-OIG Special Fraud Alert, Nov 16 2020: HCPs attending programs on the same or substantially the same topic more than once', url: OIG_SPEAKER_ALERT, doc: 'oig-speaker-programs', passage: 'repeat' },
  'P5.alcohol': { pack: 'P5', label: 'HHS-OIG Special Fraud Alert, Nov 16 2020: alcohol available at the program', url: OIG_SPEAKER_ALERT, doc: 'oig-speaker-programs', passage: 'alcohol' },
  'P5.non-hcp-guest': { pack: 'P5', label: 'HHS-OIG Special Fraud Alert, Nov 16 2020: attendees without a legitimate business reason, such as friends, significant others or family members', url: OIG_SPEAKER_ALERT, doc: 'oig-speaker-programs', passage: 'guests' },
  'P6.reconcile': { pack: 'P6', label: '42 CFR 403.904(g)(1): per-person value is calculated from the entire cost of the meal', url: CFR_403_904, doc: 'cfr-403-904', passage: 'g1' },
  'P6.card-charge': { pack: 'P6', label: 'Halden Medical policy §5: the card charge must match the itemized receipt (fictional company policy)', url: undefined, doc: 'halden-policy', passage: 's5-card' },
  'P6.covers': { pack: 'P6', label: '42 CFR 403.904(g)(1): divide the entire cost by everyone who ate, covered recipients or not', url: CFR_403_904, doc: 'cfr-403-904', passage: 'g1' },
  'P6.line-confidence': { pack: 'P6', label: 'Halden Medical policy §6: receipt lines read below the confidence gate are confirmed by a person (fictional company policy)', url: undefined, doc: 'halden-policy', passage: 's6-receipts' },
  'P6.open-payments': { pack: 'P6', label: 'CMS Open Payments: food and beverage, in kind; program year 2026 thresholds $13.82 per payment / $138.13 a year', url: CMS_OPEN_PAYMENTS, doc: 'cms-thresholds', passage: 'py2026' },
} as const satisfies Record<string, Rule>;

export type RuleId = keyof typeof RULES;

/** Every rule's document and passage, for checking that each one exists in the documents store. */
export const RULE_SOURCES: readonly { ruleId: RuleId; docId: string; passageId: string }[] =
  (Object.keys(RULES) as RuleId[]).map((ruleId) => ({ ruleId, docId: RULES[ruleId].doc, passageId: RULES[ruleId].passage }));

export function packOf(ruleId: RuleId): PackId {
  return RULES[ruleId].pack;
}

export function cite(ruleId: RuleId): Citation {
  const r = RULES[ruleId];
  return { label: r.label, ...(r.url ? { url: r.url } : {}), packId: r.pack, ruleId, version: VERSION, docId: r.doc, passageId: r.passage };
}
