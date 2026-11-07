import { describe, expect, it } from 'vitest';
import { isValidNpi } from '../src/npi';

describe('isValidNpi (Luhn check digit with the 80840 prefix)', () => {
  // Every one of these was returned by the live NPPES registry on Nov 7 2026.
  const realNpis = [
    '1003000126', // Ardalan Enkeshafi, M.D. (hospitalist)
    '1043248818', // urologist
    '1033219522', // dentist
    '1265573299', // clinical social worker
    '1821010398', // physician assistant
    '1093230252',
    '1952127466',
    '1255498432', // organization (NPI-2) — the check digit is the same algorithm
    '1750767083', // nurse practitioner
    '1407896517', // podiatrist
    '1164863692', // CRNA
  ];

  it.each(realNpis)('accepts real registry NPI %s', (npi) => {
    expect(isValidNpi(npi)).toBe(true);
  });

  it('accepts the CMS worked example 1234567893', () => {
    expect(isValidNpi('1234567893')).toBe(true);
  });

  it.each([
    ['1003000127', 'wrong check digit'],
    ['1003000125', 'wrong check digit'],
    ['1234567890', 'wrong check digit'],
    ['1003000162', 'transposed digits'],
    ['123456789', 'nine digits'],
    ['12345678901', 'eleven digits'],
    ['', 'empty'],
    ['abcdefghij', 'letters'],
    ['100300012a', 'trailing letter'],
    [' 1003000126', 'leading space'],
  ])('rejects %s (%s)', (npi) => {
    expect(isValidNpi(npi)).toBe(false);
  });
});
