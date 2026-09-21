import { customAlphabet } from "nanoid";
import { isValidGtin } from "./codes";

// No lookalike characters (0/O, 1/I/L) so SKUs stay readable on small labels.
const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const nano = customAlphabet(alphabet, 6);

export function generateSku(): string {
  return `JV-${nano()}`;
}

export function pickBarcodeType(code: string): string {
  if (isValidGtin(code)) {
    if (code.length === 12) return "upca";
    if (code.length === 13) return "ean13";
    if (code.length === 8) return "ean8";
  }
  return /^[\x20-\x7e]{1,80}$/.test(code) ? "code128" : "qrcode";
}
