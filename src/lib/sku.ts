import { customAlphabet } from "nanoid";

// No lookalike characters (0/O, 1/I/L) so SKUs stay readable on small labels.
const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const nano = customAlphabet(alphabet, 6);

export function generateSku(): string {
  return `JV-${nano()}`;
}

/** Pick a bwip-js symbology for a code. Numeric codes map to retail barcodes. */
export function pickBarcodeType(code: string): string {
  if (/^\d+$/.test(code)) {
    if (code.length === 12 || code.length === 11) return "upca";
    if (code.length === 13) return "ean13";
    if (code.length === 8) return "ean8";
  }
  return "code128";
}
