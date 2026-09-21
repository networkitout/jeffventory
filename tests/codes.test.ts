import assert from "node:assert/strict";
import test from "node:test";
import { barcodeCandidates, isValidGtin } from "../src/lib/codes";
import { generateSku, pickBarcodeType } from "../src/lib/sku";
import { calculateNet, listingDescription, listingTitle } from "../src/lib/selling";

test("retail codes validate checksums and retain leading zeros", () => {
  assert.equal(isValidGtin("012345678905"), true);
  assert.equal(isValidGtin("0012345678905"), true);
  assert.equal(isValidGtin("012345678906"), false);
  assert.equal(isValidGtin("JV-SAMPLE"), false);
  assert.equal(isValidGtin("12345678901"), false);
  assert.deepEqual(barcodeCandidates("0012345678905").sort(), ["0012345678905", "00012345678905", "012345678905"].sort());
  assert.deepEqual(barcodeCandidates(" https://example.test/box/01 "), ["https://example.test/box/01"]);
});

test("barcode auto rendering never silently replaces an invalid checksum", () => {
  assert.equal(pickBarcodeType("012345678905"), "upca");
  assert.equal(pickBarcodeType("0012345678905"), "ean13");
  assert.equal(pickBarcodeType("012345678906"), "code128");
  assert.equal(pickBarcodeType("12345678901"), "code128");
  assert.match(generateSku(), /^JV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
});

test("seller calculations use integer cents and copy only public product fields", () => {
  assert.equal(calculateNet(19.99, 5.1, 2.59, 3.5), 8.8);
  assert.equal(calculateNet(0.3, 0.1, 0.1, 0.1), 0);
  const item = {
    name: "Bench supply", description: "Tested at 12 V.", brand: "Example",
    modelNumber: "PS-12", partNumber: null, condition: "USED", quantity: 1,
    notes: "Private storage notes", serialNumber: "PRIVATE-SERIAL",
  };
  assert.equal(listingTitle(item), "Bench supply Example PS-12");
  assert.ok(listingTitle({ ...item, name: "a".repeat(100) }).length <= 80);
  assert.match(listingDescription(item), /Tested at 12 V/);
  assert.doesNotMatch(listingDescription(item), /Private|PRIVATE-SERIAL/);
});
