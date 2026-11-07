import type { Citation } from '@covers/contract';
import type { PackId } from './types';

// Every rule result carries one of these (CLAUDE.md rule 3). Sources follow the rule-pack table in
// docs/implementation.md. Items marked VERIFY must be checked against the primary source before the demo.
const VERSION = '2026-11-07';

const OIG_SPEAKER_ALERT = 'https://oig.hhs.gov/documents/special-fraud-alerts/865/SpecialFraudAlertSpeakerPrograms.pdf'; // VERIFY link
const CMS_OPEN_PAYMENTS = 'https://www.cms.gov/openpayments/program-participants/reporting-entities/data-collection';
const CA_HSC_119402 = 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=119402'; // VERIFY section

const RULES = {
  'P1.speaker-status': { pack: 'P1', label: 'Halden Medical speaker policy: only approved, trained speakers (fictional company policy); OIG Special Fraud Alert on speaker programs, Nov 16 2020', url: OIG_SPEAKER_ALERT },
  'P1.topic': { pack: 'P1', label: 'Halden Medical speaker policy: speakers present only approved topics (fictional company policy)', url: undefined },
  'P1.contract-active': { pack: 'P1', label: 'Halden Medical speaker policy: speaker contract active on the program date (fictional company policy)', url: undefined },
  'P2.identity': { pack: 'P2', label: 'CMS Open Payments: each covered recipient identified by NPI and recipient type', url: CMS_OPEN_PAYMENTS },
  'P2.duplicate-invitee': { pack: 'P2', label: 'CMS Open Payments: each covered recipient identified once', url: CMS_OPEN_PAYMENTS },
  'P2.uninvited': { pack: 'P2', label: 'CMS Open Payments: every recipient who ate must be identified on the program record', url: CMS_OPEN_PAYMENTS },
  'P3.per-person-estimate': { pack: 'P3', label: 'Halden Medical meals policy: $125 all-in per person for out-of-office dinners (fictional company policy; common industry control)', url: 'https://guidehouse.com/-/media/www/site/insights/life-sciences/2018/physician-feed-thysef.pdf' },
  'P3.per-person-actual': { pack: 'P3', label: 'Halden Medical meals policy: actual per-person cost over the cap goes to compliance (fictional company policy)', url: undefined },
  'P4.annual-cap': { pack: 'P4', label: 'Cal. Health & Safety Code §119402: company-set annual limit per HCP ($2,000, Halden Medical)', url: CA_HSC_119402 },
  'P5.repeat-attendance': { pack: 'P5', label: 'OIG Special Fraud Alert, Nov 16 2020: repeat attendance at programs on the same topic', url: OIG_SPEAKER_ALERT },
  'P5.alcohol': { pack: 'P5', label: 'OIG Special Fraud Alert, Nov 16 2020: alcohol at speaker programs', url: OIG_SPEAKER_ALERT },
  'P5.non-hcp-guest': { pack: 'P5', label: 'OIG Special Fraud Alert, Nov 16 2020: attendees with no legitimate business reason, such as spouses', url: OIG_SPEAKER_ALERT },
  'P6.reconcile': { pack: 'P6', label: 'CMS Open Payments: reported value must match the actual cost', url: CMS_OPEN_PAYMENTS },
  'P6.covers': { pack: 'P6', label: 'CMS Open Payments: per-person value divides the cost by everyone who ate', url: CMS_OPEN_PAYMENTS },
  'P6.line-confidence': { pack: 'P6', label: 'Covers receipt policy: lines read below the confidence gate are confirmed by a person', url: undefined },
  'P6.open-payments': { pack: 'P6', label: 'CMS Open Payments: food and beverage, in kind; program year 2026 thresholds $13.82 / $138.13', url: CMS_OPEN_PAYMENTS },
} as const satisfies Record<string, { pack: PackId; label: string; url: string | undefined }>;

export type RuleId = keyof typeof RULES;

export function packOf(ruleId: RuleId): PackId {
  return RULES[ruleId].pack;
}

export function cite(ruleId: RuleId): Citation {
  const r = RULES[ruleId];
  return { label: r.label, ...(r.url ? { url: r.url } : {}), packId: r.pack, ruleId, version: VERSION };
}
