import { test, expect } from "@playwright/test";
import sharp from "sharp";

const credentials = { email: "owner@example.test", password: "Test-owner-password-2026" };

test("anonymous requests cannot read or mutate inventory, photos, exports, or account data", async ({ request, page }) => {
  for (const path of ["/api/items", "/api/items/unknown", "/api/items/unknown/photos", "/api/photos/unknown", "/api/export?format=json", "/api/lookup?code=JV-TEST", "/api/categories", "/api/locations", "/api/products/lookup?code=012345678905", "/api/barcode?text=private", "/api/users"]) {
    expect((await request.get(path)).status(), path).toBe(401);
  }
  for (const path of ["/api/items", "/api/items/bulk", "/api/items/unknown/quantity", "/api/items/unknown/photos", "/api/categories", "/api/locations", "/api/users"]) {
    expect((await request.post(path, { data: {} })).status(), path).toBe(401);
  }
  expect((await request.patch("/api/items/unknown", { data: {} })).status()).toBe(401);
  expect((await request.delete("/api/items/unknown")).status()).toBe(401);
  expect((await request.delete("/api/photos/unknown")).status()).toBe(401);
  for (const path of ["/", "/items/new", "/items/unknown", "/items/unknown/edit", "/labels", "/scan", "/data", "/account"]) {
    await page.goto(path); await expect(page).toHaveURL(/\/login$/);
  }
  expect((await request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "Intruder" } })).status()).toBe(404);
  expect((await request.post("/api/auth/admin/create-user", { data: { ...credentials, role: "admin" } })).status()).toBe(404);
  expect((await request.get("/api/auth/passkey/generate-register-options")).status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/_next/image?url=%2Ficon.svg&w=64&q=75")).status()).toBe(404);
});

test("password sign-in protects cookies, photo caching and logout revokes the session", async ({ page, request, playwright, baseURL }) => {
  expect((await request.post("/api/auth/sign-in/email", { data: { ...credentials, password: "wrong-password" } })).status()).toBe(401);
  expect((await request.post("/api/auth/sign-in/email", { headers: { Origin: "https://evil.test" }, data: credentials })).status()).toBe(403);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  const state = await page.context().storageState();
  const cookie = state.cookies.find(value => value.name.includes("session_token"));
  expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe("Lax");
  const client = await playwright.request.newContext({ baseURL, storageState: state });
  const item = await (await client.post("/api/items", { data: { name: "Private photo test" } })).json();
  const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
  const [photo] = await (await client.post(`/api/items/${item.id}/photos`, { multipart: { files: { name: "private.png", mimeType: "image/png", buffer } } })).json();
  const path = `/api/photos/${photo.id}`;
  expect((await client.get(path)).headers()["cache-control"]).toContain("no-store");
  expect((await request.get(path)).status()).toBe(401);
  const logout = await client.post("/api/auth/sign-out", { headers: { Origin: baseURL! }, data: {} });
  expect(logout.ok(), await logout.text()).toBe(true);
  const replay = await playwright.request.newContext({ baseURL, storageState: state });
  expect((await replay.get("/api/items")).status()).toBe(401);
  await replay.dispose(); await client.dispose();
});

test("owner provisions shared access and disabling an account revokes existing sessions", async ({ request, playwright, baseURL }) => {
  expect((await request.post("/api/auth/sign-in/email", { data: credentials })).ok()).toBe(true);
  const memberCredentials = { email: "member@example.test", password: "Member-password-2026" };
  const created = await request.post("/api/users", { headers: { Origin: baseURL! }, data: { ...memberCredentials, name: "Member", role: "admin" } });
  expect(created.status(), await created.text()).toBe(201);
  const member = await created.json(); expect(member.role).toBe("user");
  const client = await playwright.request.newContext({ baseURL });
  expect((await client.post("/api/auth/sign-in/email", { data: memberCredentials })).ok()).toBe(true);
  expect((await client.get("/api/items")).status()).toBe(200);
  expect((await client.get("/api/users")).status()).toBe(403);
  expect((await client.post("/api/users", { data: { name: "Escalation", email: "bad@example.test", password: "Unexpected-password" } })).status()).toBe(403);
  expect((await request.patch("/api/users", { data: { id: member.id, banned: true } })).ok()).toBe(true);
  expect((await client.get("/api/items")).status()).toBe(401);
  expect((await client.post("/api/auth/sign-in/email", { data: memberCredentials })).ok()).toBe(false);
  await client.dispose();
});

test("passkeys enroll, authenticate, reject reused assertions, and can be removed", async ({ page, context, baseURL }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await page.getByRole("link", { name: "Account & access" }).click();
  await page.getByLabel("Passkey name").fill("Test device");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("button", { name: "Remove Test device" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const assertion = page.waitForRequest(request => request.url().endsWith("/passkey/verify-authentication"));
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  const body = (await assertion).postDataJSON();
  await expect(page).toHaveURL(`${baseURL}/`);
  expect((await context.request.post("/api/auth/passkey/verify-authentication", { data: body, headers: { Origin: baseURL! } })).ok()).toBe(false);
  await page.goto("/account");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Remove Test device" }).click();
  await expect(page.getByText("No passkeys added yet.")).toBeVisible();
  await cdp.detach();
});
