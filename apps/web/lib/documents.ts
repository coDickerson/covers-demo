// The document set behind every decision. Policy text is fictional demo content; regulations stay empty until
// their real text is stored, so nothing here can misquote a source.
export type DocKey = 'audit' | 'receipt' | 'attendance' | 'fund' | 'ledger' | 'npi' | 'speaker' | 'policy' | 'oig' | 'cal' | 'cms';

export const DOC_LIST: { key: DocKey; title: string; kind: string; meta: string; url?: string }[] = [
  { key: 'audit', title: 'Audit trail', kind: 'Trail', meta: 'Every action on this dinner, in order' },
  { key: 'receipt', title: 'Receipt', kind: 'Evidence', meta: 'As read from the photo' },
  { key: 'attendance', title: 'Attendance confirmation', kind: 'Evidence', meta: 'Confirmed by the rep' },
  { key: 'fund', title: 'Ramp card', kind: 'Evidence', meta: 'Card limit for this dinner' },
  { key: 'ledger', title: 'Annual totals by clinician', kind: 'Evidence', meta: 'Covers ledger' },
  { key: 'npi', title: 'NPI registry records', kind: 'Evidence', meta: 'Demo doctors are fictional. Real lookups come from the NPPES registry' },
  { key: 'speaker', title: 'Speaker record', kind: 'Evidence', meta: 'Company speaker roster, fictional' },
  { key: 'policy', title: 'HCP meals and speaker policy', kind: 'Policy', meta: 'Company policy v1, fictional demo policy' },
  { key: 'oig', title: 'Special Fraud Alert: Speaker Programs', kind: 'Regulation', meta: 'HHS Office of Inspector General, Nov 16, 2020', url: 'https://oig.hhs.gov/documents/special-fraud-alerts/865/SpecialFraudAlertSpeakerPrograms.pdf' },
  { key: 'cal', title: 'Health & Safety Code §119402', kind: 'Regulation', meta: 'State of California', url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=119402' },
  { key: 'cms', title: 'Open Payments: data collection', kind: 'Regulation', meta: 'Centers for Medicare & Medicaid Services', url: 'https://www.cms.gov/openpayments/program-participants/reporting-entities/data-collection' },
];

export const POLICY = [
  { at: 'speaker', text: '§1 Speakers. Only approved, trained speakers under an active contract may present, and only on topics they are approved for.' },
  { at: 'meal', text: '§2 Meals. Out-of-office dinners may not exceed $125 per person, including food, beverage, tax and tip.' },
  { at: 'annual', text: '§3 Annual limit. Meals provided to any one health care professional may not exceed $2,000 in a calendar year.' },
  { at: 'repeat', text: '§4 Repeat attendance. A third program on the same topic within 12 months goes to compliance.' },
];

export const AUDIT_LABEL: Record<string, string> = {
  'plan.created': 'Created the plan',
  'plan.updated': 'Changed the guest list',
  'plan.evaluated': 'Ran the checks',
  'exception.approved': 'Approved an exception',
  'fund.issued': 'Issued the card',
  'receipt.read': 'Read the receipt',
  'receipt.line_fixed': 'Corrected a receipt line',
  'attendance.confirmed': 'Confirmed who ate and settled',
};

export const AUDIT_DOC: Record<string, DocKey> = { 'fund.issued': 'fund', 'receipt.read': 'receipt', 'receipt.line_fixed': 'receipt', 'attendance.confirmed': 'attendance' };
