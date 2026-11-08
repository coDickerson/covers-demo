import { describe, expect, it } from 'vitest';
import type { RecipientType } from '@covers/contract';
import { recipientTypeForTaxonomy } from '../src/recipient-type';

const table: Array<[code: string | undefined, expected: RecipientType, what: string]> = [
  // Allopathic & osteopathic physicians (NUCC 20xxxxxxxX)
  ['207R00000X', 'physician', 'Internal Medicine'],
  ['208M00000X', 'physician', 'Hospitalist'],
  ['208800000X', 'physician', 'Urology'],
  ['207RC0000X', 'physician', 'Cardiovascular Disease'],
  ['2084P0800X', 'physician', 'Psychiatry'],
  ['204E00000X', 'physician', 'Oral & Maxillofacial Surgery'],
  ['202C00000X', 'physician', 'Independent Medical Examiner'],
  // Physicians under Open Payments: dentists, podiatrists, optometrists, chiropractors
  ['122300000X', 'physician', 'Dentist'],
  ['1223G0001X', 'physician', 'Dentist, General Practice'],
  ['1223S0112X', 'physician', 'Dentist, Oral & Maxillofacial Surgery'],
  ['213E00000X', 'physician', 'Podiatrist'],
  ['213ES0103X', 'physician', 'Podiatrist, Foot & Ankle Surgery'],
  ['152W00000X', 'physician', 'Optometrist'],
  ['152WC0802X', 'physician', 'Optometrist, Corneal and Contact Management'],
  ['111N00000X', 'physician', 'Chiropractor'],
  ['111NS0005X', 'physician', 'Chiropractor, Sports Physician'],
  // Non-physician practitioners with their own recipient type
  ['363A00000X', 'physician_assistant', 'Physician Assistant'],
  ['363AM0700X', 'physician_assistant', 'Physician Assistant, Medical'],
  ['363L00000X', 'nurse_practitioner', 'Nurse Practitioner'],
  ['363LF0000X', 'nurse_practitioner', 'Nurse Practitioner, Family'],
  // Other covered NPPs
  ['364S00000X', 'other_clinician', 'Clinical Nurse Specialist'],
  ['364SA2100X', 'other_clinician', 'Clinical Nurse Specialist, Acute Care'],
  ['367500000X', 'other_clinician', 'Nurse Anesthetist, Certified Registered'],
  ['367H00000X', 'other_clinician', 'Anesthesiologist Assistant'],
  ['367A00000X', 'other_clinician', 'Advanced Practice Midwife (certified nurse-midwife)'],
  // Not covered recipients
  ['390200000X', 'non_hcp', 'Student in training (residents are excluded under Open Payments)'],
  ['1041C0700X', 'non_hcp', 'Social Worker, Clinical'],
  ['101Y00000X', 'non_hcp', 'Counselor'],
  ['225400000X', 'non_hcp', 'Rehabilitation Practitioner'],
  ['163W00000X', 'non_hcp', 'Registered Nurse'],
  ['124Q00000X', 'non_hcp', 'Dental Hygienist'],
  ['122400000X', 'non_hcp', 'Denturist'],
  ['176B00000X', 'non_hcp', 'Midwife (not a certified nurse-midwife)'],
  ['374J00000X', 'non_hcp', 'Doula'],
  ['183500000X', 'non_hcp', 'Pharmacist'],
  ['367800000X', 'non_hcp', 'not one of the three covered 367 codes'],
  ['282NR1301X', 'non_hcp', 'Rural hospital (organization)'],
  [undefined, 'non_hcp', 'no taxonomy'],
  ['', 'non_hcp', 'empty code'],
  ['20', 'non_hcp', 'malformed short code'],
];

describe('recipientTypeForTaxonomy', () => {
  it.each(table)('%s → %s (%s)', (code, expected) => {
    expect(recipientTypeForTaxonomy(code)).toBe(expected);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(recipientTypeForTaxonomy(' 207r00000x ')).toBe('physician');
    expect(recipientTypeForTaxonomy('363lf0000x')).toBe('nurse_practitioner');
  });
});
