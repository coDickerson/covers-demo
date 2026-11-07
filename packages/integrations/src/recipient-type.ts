import type { RecipientType } from '@covers/contract';

/**
 * Maps an NUCC provider taxonomy code (the registry's primary taxonomy) to an Open Payments
 * covered-recipient type.
 *
 * Source: CMS Open Payments glossary, checked Nov 7 2026
 * https://www.cms.gov/priorities/key-initiatives/open-payments/glossary-acronyms
 *   - "Physician": doctors of medicine or osteopathy, dentists, podiatrists, optometrists and
 *     chiropractors legally authorized to practice by the state. Medical residents are excluded.
 *   - "Non-Physician Practitioner Covered Recipient" (added Jan 2021, SUPPORT Act): physician
 *     assistants, nurse practitioners, clinical nurse specialists, certified registered nurse
 *     anesthetists, anesthesiologist assistants and certified nurse-midwives.
 *
 * Everything else (nurses, therapists, social workers, pharmacists, students/residents
 * 390200000X, organizations, unknown or missing codes) is `non_hcp`.
 * Only the code is used; we never guess from the credential string.
 */
const RULES: ReadonlyArray<readonly [test: (code: string) => boolean, type: RecipientType]> = [
  // Allopathic & Osteopathic Physicians: every NUCC code in this group starts with "20".
  [(c) => c.startsWith('20'), 'physician'],
  [(c) => c.startsWith('1223'), 'physician'], // Dentist (122300000X and specialties); not 1224 denturist, 124Q hygienist
  [(c) => c.startsWith('213E'), 'physician'], // Podiatrist
  [(c) => c.startsWith('152W'), 'physician'], // Optometrist
  [(c) => c.startsWith('111N'), 'physician'], // Chiropractor
  [(c) => c.startsWith('363A'), 'physician_assistant'],
  [(c) => c.startsWith('363L'), 'nurse_practitioner'],
  [(c) => c.startsWith('364S'), 'other_clinician'], // Clinical Nurse Specialist
  [(c) => c === '367500000X', 'other_clinician'], // Certified Registered Nurse Anesthetist
  [(c) => c === '367H00000X', 'other_clinician'], // Anesthesiologist Assistant
  [(c) => c === '367A00000X', 'other_clinician'], // Advanced Practice Midwife (certified nurse-midwife)
];

const TAXONOMY_CODE = /^[0-9A-Z]{9}X$/;

export function recipientTypeForTaxonomy(code: string | undefined): RecipientType {
  const c = (code ?? '').trim().toUpperCase();
  if (!TAXONOMY_CODE.test(c)) return 'non_hcp';
  for (const [test, type] of RULES) if (test(c)) return type;
  return 'non_hcp';
}
