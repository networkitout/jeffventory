import { test, expect } from "@playwright/test";

test("mobile inventory and item forms fit the viewport and remain actionable", async ({ page, request }) => {
  const response = await request.post("/api/items", { data: { name: "Mobile workbench component", quantity: 5, partNumber: "MOBILE-PART", categoryName: "Components", locationName: "Drawer C" } });
  expect(response.status()).toBe(201);
  const item = await response.json();
  for (const path of ["/?q=MOBILE-PART", "/items/new", `/items/${item.id}`, `/items/${item.id}/edit`, "/scan", "/data"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true);
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  }
  await page.goto("/?q=MOBILE-PART");
  await page.getByRole("checkbox", { name: "Select Mobile workbench component" }).check();
  await page.getByRole("link", { name: "Print selected" }).click();
  await expect(page.locator(".inventory-label")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("camera denial leaves the manual lookup usable", async ({ page, request }) => {
  const response = await request.post("/api/items", { data: { name: "Manual scan after camera denial", sku: "JV-MOBILE-SCAN" } });
  const item = await response.json();
  await page.goto("/scan");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/camera/i);
  await page.getByLabel("Enter or scan a code").fill("JV-MOBILE-SCAN");
  await page.getByRole("button", { name: "Find in inventory" }).click();
  await expect(page).toHaveURL(new RegExp(`/items/${item.id}$`));
});
