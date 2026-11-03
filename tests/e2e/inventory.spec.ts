import { test, expect, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";

type Item = { id: string; sku: string; name: string; quantity: number; upc: string | null; status: string; photos: { id: string; width: number; height: number }[] };

async function createItem(request: APIRequestContext, values: Record<string, unknown> = {}): Promise<Item> {
  const response = await request.post("/api/items", { data: { name: `Fixture ${Date.now()}`, ...values } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

test("health endpoint reports a migrated database without exposing inventory", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("API validates inventory inputs and preserves manufacturer codes", async ({ request }) => {
  for (const invalid of [
    null, [], { name: "   " }, { name: 7 }, { name: "Invalid", quantity: -1 },
    { name: "Invalid", quantity: 1.5 }, { name: "Invalid", status: "UNKNOWN" },
    { name: "Invalid", condition: "BROKEN" }, { name: "Invalid", listPrice: "Infinity" },
    { name: "Invalid", upc: { value: "012345678905" } },
    { name: "Invalid", ebayUrl: "javascript:alert(1)" },
  ]) {
    const response = await request.post("/api/items", { data: JSON.stringify(invalid), headers: { "Content-Type": "application/json" } });
    expect(response.status(), await response.text()).toBe(400);
  }
  const malformed = await request.post("/api/items", { data: "{", headers: { "Content-Type": "application/json" } });
  expect(malformed.status()).toBe(400);
  const item = await createItem(request, { name: "Precision part", upc: "012345678905", partNumber: "PRT-00017", listPrice: "", sku: "JV-API-VALIDATION" });
  expect(item.upc).toBe("012345678905");
  const duplicate = await request.post("/api/items", { data: { name: "Duplicate", sku: item.sku } });
  expect(duplicate.status()).toBe(409);
  const matches = await request.get("/api/items?q=PRT-00017");
  expect((await matches.json()).map((match: Item) => match.id)).toContain(item.id);
  expect((await request.get("/api/items/missing-id")).status()).toBe(404);
  const originWrite = await request.patch(`/api/items/${item.id}`, { headers: { Origin: "https://untrusted.example" }, data: { name: "Changed elsewhere" } });
  expect(originWrite.status()).toBe(403);
});

test("quantity adjustments are atomic and appear in item history", async ({ request }) => {
  const item = await createItem(request, { name: "Atomic resistors", quantity: 3, lowStockThreshold: 2 });
  const results = await Promise.all([
    request.post(`/api/items/${item.id}/quantity`, { data: { delta: -3, note: "Used in bench project" } }),
    request.post(`/api/items/${item.id}/quantity`, { data: { delta: -3, note: "Concurrent adjustment" } }),
  ]);
  expect(results.filter((result) => result.ok())).toHaveLength(1);
  expect(results.every((result) => result.status() < 500)).toBe(true);
  const after = await (await request.get(`/api/items/${item.id}`)).json();
  expect(after.quantity).toBe(0);
  expect(after.activities.length).toBeGreaterThan(1);
  const low = await (await request.get("/api/items?lowStock=1")).json();
  expect(low.map((value: Item) => value.id)).toContain(item.id);
  const invalid = await request.post(`/api/items/${item.id}/quantity`, { data: { delta: 0.5 } });
  expect(invalid.status()).toBe(400);
});

test("photos are decoded, normalized, capped, and removed with the item", async ({ request }) => {
  const item = await createItem(request, { name: "Photographed board" });
  const image = await sharp({ create: { width: 120, height: 90, channels: 3, background: "#81d9b0" } }).png().toBuffer();
  const upload = await request.post(`/api/items/${item.id}/photos`, { multipart: { files: { name: "board.png", mimeType: "image/png", buffer: image } } });
  expect(upload.status(), await upload.text()).toBe(201);
  const [photo] = await upload.json();
  expect(photo.width).toBe(120);
  const stored = await request.get(`/api/photos/${photo.id}`);
  expect(stored.headers()["content-type"]).toContain("image/webp");
  const metadata = await sharp(await stored.body()).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.exif).toBeUndefined();
  const bad = await request.post(`/api/items/${item.id}/photos`, { multipart: { files: { name: "fake.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") } } });
  expect(bad.status()).toBe(400);
  const batch = new FormData();
  for (let index = 0; index < 5; index++) batch.append("files", new File([new Uint8Array(image)], `board-${index}.png`, { type: "image/png" }));
  const batchResult = await request.post(`/api/items/${item.id}/photos`, { multipart: batch });
  expect(batchResult.status(), await batchResult.text()).toBe(201);
  const lastTwo = () => {
    const form = new FormData();
    for (let index = 0; index < 2; index++) form.append("files", new File([new Uint8Array(image)], `last-${index}.png`, { type: "image/png" }));
    return form;
  };
  const concurrent = await Promise.all([
    request.post(`/api/items/${item.id}/photos`, { multipart: lastTwo() }),
    request.post(`/api/items/${item.id}/photos`, { multipart: lastTwo() }),
  ]);
  expect(concurrent.map((result) => result.status()).sort()).toEqual([201, 409]);
  const extra = await request.post(`/api/items/${item.id}/photos`, { multipart: { files: { name: "ninth.png", mimeType: "image/png", buffer: image } } });
  expect([400, 409]).toContain(extra.status());
  const beforeDelete = await (await request.get(`/api/items/${item.id}`)).json();
  expect(beforeDelete.photos).toHaveLength(8);
  expect((await request.delete(`/api/photos/${photo.id}`)).ok()).toBe(true);
  expect((await request.get(`/api/photos/${photo.id}`)).status()).toBe(404);
  const remaining = beforeDelete.photos[1].id;
  expect((await request.delete(`/api/items/${item.id}`)).ok()).toBe(true);
  expect((await request.get(`/api/photos/${remaining}`)).status()).toBe(404);
});

test("product suggestions require consent and keep existing fields during photo-assisted creation", async ({ page, request }) => {
  let lookups = 0;
  await page.route("**/api/products/lookup?**", async (route) => {
    lookups += 1;
    await route.fulfill({ json: {
      found: true, product: { name: "Suggested board name", brand: "Workbench Brand", modelNumber: "WB-42", categoryName: "Development boards", description: "A catalog description." },
      source: "UPCitemdb", sourceUrl: "https://www.upcitemdb.com/upc/012345678905",
    } });
  });
  await page.goto("/items/new");
  await page.getByLabel("Item name", { exact: false }).fill("My photographed controller");
  await page.getByLabel("Product barcode or existing QR code").fill("012345678905");
  expect(lookups).toBe(0);
  await page.getByRole("button", { name: "Look up product", exact: true }).click();
  await expect(page.getByText("Suggested board name", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fill empty fields" }).click();
  await expect(page.getByLabel("Item name", { exact: false })).toHaveValue("My photographed controller");
  await expect(page.getByLabel("Brand / manufacturer")).toHaveValue("Workbench Brand");
  await page.getByLabel("Serial number", { exact: true }).fill("PRIVATE-SERIAL-42");
  await page.getByLabel("Private notes", { exact: true }).fill("Private shelf purchase notes");
  await page.getByLabel("Storage location", { exact: true }).fill("Workbench bin A");
  await page.getByLabel("Quantity", { exact: true }).fill("4");
  const image = await sharp({ create: { width: 100, height: 80, channels: 3, background: "#c59d75" } }).png().toBuffer();
  await page.getByLabel("Choose item photos").setInputFiles({ name: "controller.png", mimeType: "image/png", buffer: image });
  await page.getByRole("button", { name: "Create item", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/c[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: "My photographed controller", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "My photographed controller, photo 1" })).toBeVisible();
  await expect(page.getByLabel("Listing description", { exact: true })).not.toHaveValue(/PRIVATE-SERIAL|Private shelf/);
  const id = page.url().split("/").pop()!;
  const detail = await (await request.get(`/api/items/${id}`)).json();
  expect(detail.photos).toHaveLength(1);
  expect(lookups).toBe(1);
  await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
  await expect(page.getByLabel("Current quantity")).toHaveText("5");
  await page.getByRole("link", { name: "Edit item", exact: true }).click();
  await page.getByLabel("Item name", { exact: false }).fill("My updated controller");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My updated controller", exact: true })).toBeVisible();
});

test("scan fallback handles unknown codes, multiple matches, and network errors truthfully", async ({ page, request }) => {
  const first = await createItem(request, { name: "Scanner shared product A", upc: "4006381333931" });
  await createItem(request, { name: "Scanner shared product B", upc: "4006381333931" });
  await page.goto("/scan");
  await page.getByLabel("Enter or scan a code").fill("4006381333931");
  await page.getByRole("button", { name: "Find in inventory" }).click();
  await expect(page.getByRole("heading", { name: "2 items share this product code" })).toBeVisible();
  await page.getByRole("link", { name: /Scanner shared product A/ }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${first.id}$`));
  await page.goto("/scan");
  const code = "https://example.test/storage/box-007";
  await page.getByLabel("Enter or scan a code").fill(code);
  await page.getByRole("button", { name: "Find in inventory" }).click();
  await page.getByRole("link", { name: "Add item with this code" }).click();
  await expect(page.getByLabel("Product barcode or existing QR code")).toHaveValue(code);
  await page.goto("/scan");
  await page.route("**/api/lookup?**", (route) => route.fulfill({ status: 503, json: { error: "The local database is unavailable. Try again." } }));
  await page.getByLabel("Enter or scan a code").fill("NETWORK-FAILURE");
  await page.getByRole("button", { name: "Find in inventory" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("database is unavailable");
  await expect(page.getByText("Not in your inventory yet", { exact: true })).toHaveCount(0);
});

test("retrying a failed photo upload does not create a duplicate inventory item", async ({ page, request }) => {
  await page.route("**/api/items/*/photos", (route) => route.fulfill({ status: 503, json: { error: "Photo storage temporarily unavailable." } }), { times: 1 });
  await page.goto("/items/new");
  await page.getByLabel("Item name", { exact: false }).fill("Upload retry fixture");
  const image = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#4a7c62" } }).png().toBuffer();
  await page.getByLabel("Choose item photos").setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: image });
  await page.getByRole("button", { name: "Create item", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("The item is saved");
  const first = await (await request.get("/api/items?q=Upload%20retry%20fixture")).json();
  expect(first).toHaveLength(1);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${first[0].id}$`));
  const second = await (await request.get("/api/items?q=Upload%20retry%20fixture")).json();
  expect(second).toHaveLength(1);
  expect(second[0].photos).toHaveLength(1);
});

test("generated QR and nonstandard numeric labels decode back to the exact inventory code", async ({ page, request }) => {
  for (const [code, type, field] of [
    ["JV-ROUNDTRIP", "qrcode", "sku"],
    ["012345678906", "auto", "sku"],
    ["https://example.test/shelf/box-007?part=R1", "qrcode", "upc"],
  ] as const) {
    const item = await createItem(request, { name: `Code roundtrip ${code}`, [field]: code });
    const png = await request.get(`/api/barcode?text=${encodeURIComponent(code)}&type=${type}&scale=4`);
    expect(png.ok()).toBe(true);
    await page.goto("/scan");
    await page.getByLabel("Choose a barcode photo").setInputFiles({ name: "code.png", mimeType: "image/png", buffer: await png.body() });
    await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
  }
  expect((await request.get("/api/barcode?text=foo&scale=NaN")).status()).toBe(400);
});

test("similar items copy product details but get their own identity and stock state", async ({ page, request }) => {
  const original = await createItem(request, {
    name: "Similar item source", sku: "JV-SIMILAR-SOURCE", upc: "012345678905",
    quantity: 8, status: "SOLD", serialNumber: "ORIGINAL-SERIAL", partNumber: "PART-COPY",
    purchasePrice: 10, listPrice: 20, salePrice: 18,
  });
  await page.goto(`/items/new?copy=${original.id}`);
  await expect(page.getByLabel("Internal SKU", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Serial number", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Part number", { exact: true })).toHaveValue("PART-COPY");
  await expect(page.getByLabel("Inventory status", { exact: true })).toHaveValue("IN_STOCK");
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("1");
  await page.getByRole("button", { name: "Create item", exact: true }).click();
  await expect(page).toHaveURL(/\/items\/c[a-z0-9]+$/);
  const copiedId = page.url().split("/").pop()!;
  expect(copiedId).not.toBe(original.id);
  const copied = await (await request.get(`/api/items/${copiedId}`)).json();
  expect(copied.sku).not.toBe(original.sku);
  expect(copied.serialNumber).toBeNull();
  expect(copied.salePrice).toBeNull();
  expect(copied.photos).toHaveLength(0);
});

test("bulk actions, reusable label sizes, and exports preserve selection", async ({ page, request }) => {
  const first = await createItem(request, { name: "Bulk fixture one", quantity: 2, listPrice: 12.5, notes: "=FORMULA" });
  const second = await createItem(request, { name: "Bulk fixture two", quantity: 3 });
  await page.goto("/?q=Bulk%20fixture");
  await page.getByRole("checkbox", { name: "Select all items on this page" }).check();
  await page.getByLabel("New status for selected items").selectOption("LISTED");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Updated 2 items");
  expect((await (await request.get(`/api/items/${first.id}`)).json()).status).toBe("LISTED");
  expect((await (await request.get(`/api/items/${second.id}`)).json()).status).toBe("LISTED");
  await page.getByRole("checkbox", { name: "Select all items on this page" }).check();
  await page.getByRole("link", { name: "Print selected" }).click();
  await page.getByLabel("Label size").selectOption("compact");
  await page.getByLabel("Copies / item").fill("2");
  await page.getByLabel("Show price").check();
  await page.getByRole("button", { name: "Update preview" }).click();
  await expect(page.locator(".inventory-label")).toHaveCount(4);
  const dimensions = await page.locator(".inventory-label").first().evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  expect(dimensions.width).toBeCloseTo(192);
  expect(dimensions.height).toBeCloseTo(96);
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printRequested = "true"; }; });
  await page.getByRole("button", { name: "Print labels", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-requested", "true");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  await expect(page.locator(".label-grid img").first()).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  const exported = await request.get(`/api/export?format=csv&ids=${first.id}`);
  expect(exported.headers()["content-disposition"]).toContain("attachment");
  const csv = await exported.text();
  expect(csv).toContain("Bulk fixture one");
  expect(csv).not.toContain("Bulk fixture two");
  expect(csv).toContain("'=FORMULA");
  const invalidBulk = await request.post("/api/items/bulk", { data: { ids: [first.id, "missing-id"], status: "ARCHIVED" } });
  expect(invalidBulk.status()).toBe(404);
  expect((await (await request.get(`/api/items/${first.id}`)).json()).status).toBe("LISTED");
});
