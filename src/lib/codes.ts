export function isValidGtin(code: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const checkDigit = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

export function barcodeCandidates(raw: string): string[] {
  const code = raw.trim();
  if (!isValidGtin(code) || code.length === 8) return [code];

  const gtin = code.padStart(14, "0");
  const candidates = [code, gtin];
  if (gtin.startsWith("0")) candidates.push(gtin.slice(1));
  if (gtin.startsWith("00")) candidates.push(gtin.slice(2));
  return [...new Set(candidates)];
}
