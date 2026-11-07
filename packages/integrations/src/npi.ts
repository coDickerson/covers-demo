/**
 * NPI check digit: Luhn over the first nine digits with the card-issuer prefix 80840
 * (CMS, "Requirements for NPI Check Digit"). Pure format check; it says nothing about
 * whether the registry has the number.
 */
export function isValidNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false;
  const digits = `80840${npi}`;
  let sum = 0;
  // Standard Luhn: double every second digit counting from the right, excluding the check digit.
  for (let i = digits.length - 1, double = false; i >= 0; i--, double = !double) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
