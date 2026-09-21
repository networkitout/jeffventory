import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { ApiError, assertMutationRequest, readBoundedBody, readJsonBody } from "../src/lib/api-errors";
import { MAX_CODE_LENGTH, parseBulkUpdate, parseIds, parseItemCreate, parseItemPatch, parseNamedEntity, parsePrice, parseQuantityChange } from "../src/lib/item-validation";
import { csvCell, inventoryMetadata } from "../src/lib/inventory-export";

function isBadInput(error: unknown) {
  return error instanceof ApiError && error.status === 400;
}

test("inventory validation preserves codes and normalizes optional form fields", () => {
  const item = parseItemCreate({
    name: "  Oscilloscope probe ", upc: " 0012345678905 ", sku: "",
    quantity: "2", listPrice: "12.50", purchasePrice: "", lowStockThreshold: "",
    categoryName: " Test gear ", brand: "", locationName: null,
  });
  assert.equal(item.name, "Oscilloscope probe");
  assert.equal(item.upc, "0012345678905");
  assert.equal(item.sku, null);
  assert.equal(item.quantity, 2);
  assert.equal(item.listPrice, 12.5);
  assert.equal(item.purchasePrice, null);
  assert.equal(item.lowStockThreshold, null);
  assert.equal(item.brand, null);
  assert.equal(item.status, "IN_STOCK");
  assert.equal(item.condition, "USED");
  assert.deepEqual(parseItemPatch({ categoryName: "", locationName: "", lowStockThreshold: 0 }), {
    categoryName: null, locationName: null, lowStockThreshold: 0,
  });
  assert.equal(parseNamedEntity({ name: " Drawer A " }), "Drawer A");
});

test("invalid shapes, fields, enums, quantities, and unprintable long codes are rejected", () => {
  for (const invalid of [
    null, [], "item", { name: " " }, { name: 2 }, { name: "Item", surprise: true },
    { name: "Item", quantity: -1 }, { name: "Item", quantity: 0.5 },
    { name: "Item", quantity: true }, { name: "Item", quantity: "Infinity" },
    { name: "Item", lowStockThreshold: -1 }, { name: "Item", status: "READY" },
    { name: "Item", condition: "BROKEN" }, { name: "Item", upc: 1234 },
    { name: "Item", upc: "x".repeat(MAX_CODE_LENGTH + 1) },
  ]) assert.throws(() => parseItemCreate(invalid), isBadInput);
  assert.throws(() => parseItemPatch({}), isBadInput);
  assert.throws(() => parseItemPatch({ sku: "" }), isBadInput);
  assert.throws(() => parseNamedEntity({ name: {} }), isBadInput);
});

test("prices are bounded USD amounts with no hidden rounding or boolean coercion", () => {
  for (const valid of [0, 19.99, 0.1 + 0.2, 1_000_000_000, "19.99", ".50", "0"]) {
    assert.equal(typeof parsePrice(valid), "number");
  }
  for (const invalid of [-1, Infinity, NaN, 1.001, true, {}, "1e6", "12.501", "-0.01", "NaN", 1_000_000_001]) {
    assert.throws(() => parsePrice(invalid), isBadInput);
  }
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice(null), null);
});

test("listing URLs are limited to real eBay http(s) domains", () => {
  for (const url of ["https://www.ebay.com/itm/123", "https://ebay.co.uk/itm/123", "https://www.ebay.de/itm/123"]) {
    assert.equal(parseItemPatch({ ebayUrl: url }).ebayUrl, url);
  }
  for (const url of ["javascript:alert(1)", "https://ebay.com.evil.test/item", "https://user:password@ebay.com/item", "ftp://ebay.com/item", "https://notebay.com/item"]) {
    assert.throws(() => parseItemPatch({ ebayUrl: url }), isBadInput);
  }
});

test("bulk and quantity requests require intentional, bounded operations", () => {
  assert.deepEqual(parseIds([" a ", "a", "b"]), ["a", "b"]);
  assert.deepEqual(parseBulkUpdate({ ids: ["a"], locationName: "" }), { ids: ["a"], locationName: null });
  assert.deepEqual(parseQuantityChange({ delta: "-3", note: " Project A " }), { delta: -3, note: "Project A" });
  for (const invalid of [{ ids: [] }, { ids: ["a"] }, { ids: Array.from({ length: 201 }, (_, i) => String(i)), status: "SOLD" }]) {
    assert.throws(() => parseBulkUpdate(invalid), isBadInput);
  }
  for (const delta of [0, 0.5, "bad", null, true]) assert.throws(() => parseQuantityChange({ delta }), isBadInput);
});

test("CSV quoting neutralizes formulas even after whitespace and escaped separators", () => {
  assert.equal(csvCell('part, "quoted"\nnext'), '"part, ""quoted""\nnext"');
  for (const formula of ["=SUM(1,2)", "+cmd", "-1+2", "@SUM(A1)", "  =formula", "\tvalue", "\u200b=formula", "\uff1dformula"]) {
    assert.ok(csvCell(formula).startsWith("\"'"));
  }
  assert.equal(csvCell("001234"), '"001234"');
  assert.equal(csvCell(null), '""');
  assert.equal(inventoryMetadata([], new Date("2026-01-01T00:00:00Z")).includesImageBinaries, false);
});

test("mutation origin and JSON-body limits are enforced", async () => {
  const loopback = new NextRequest("http://127.0.0.1:3100/api/items", {
    method: "POST",
    headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100", "Content-Type": "application/json" },
    body: '{"name":"Loopback item"}',
  });
  assert.equal(new URL(loopback.url).hostname, "localhost");
  assert.deepEqual(await readJsonBody(loopback), { name: "Loopback item" });
  assert.throws(() => assertMutationRequest(new NextRequest("http://127.0.0.1:3100/api/items", {
    headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3000" },
  })), (error) => error instanceof ApiError && error.status === 403);
  const sameOrigin = new Request("http://127.0.0.1:3100/api/items", {
    method: "POST", headers: { Origin: "http://127.0.0.1:3100", "Content-Type": "application/json" }, body: '{"name":"Item"}',
  });
  assert.deepEqual(await readJsonBody(sameOrigin), { name: "Item" });
  assert.throws(() => assertMutationRequest(new Request("http://127.0.0.1:3100/api/items", {
    headers: { Origin: "https://evil.test" },
  })), (error) => error instanceof ApiError && error.status === 403);
  await assert.rejects(readJsonBody(new Request("http://localhost/api/items", {
    method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}",
  })), (error) => error instanceof ApiError && error.status === 415);
  await assert.rejects(readJsonBody(new Request("http://localhost/api/items", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  })), isBadInput);
  await assert.rejects(readBoundedBody(new Request("http://localhost", {
    method: "POST", body: "12345",
  }), 4), (error) => error instanceof ApiError && error.status === 413);
});
