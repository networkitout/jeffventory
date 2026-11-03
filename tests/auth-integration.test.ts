import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";

test("database sessions, route guards, owner access, rate limits, and console recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jeffventory-auth-test-"));
  process.env.DATABASE_URL = `file:${join(directory, "auth.db")}`;
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.BETTER_AUTH_URL = "http://localhost:3100";
  const migration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env: process.env, encoding: "utf8" });
  assert.equal(migration.status, 0, migration.stderr);
  const { prisma } = await import("../src/lib/db");
  try {
    const { createLocalUser, recoverLocalUser } = await import("../src/lib/user-management");
    const authRoute = await import("../src/app/api/auth/[...all]/route");
    const items = await import("../src/app/api/items/route");
    const accounts = await import("../src/app/api/users/route");
    const origin = process.env.BETTER_AUTH_URL;
    function request(path: string, method = "GET", body?: unknown, cookie = "", extras?: Record<string, string>) {
      return new NextRequest(`${origin}${path}`, { method, headers: { Origin: origin, Cookie: cookie, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extras }, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    async function auth(path: string, method = "GET", body?: unknown, cookie = "", extras?: Record<string, string>) {
      return (method === "GET" ? authRoute.GET : authRoute.POST)(request(`/api/auth/${path}`, method, body, cookie, extras), { params: Promise.resolve({ all: path.split("/") }) });
    }
    const credentials = { name: "Owner", email: "owner@example.test", password: "test-owner-long-password" };
    await createLocalUser(credentials, true);
    await assert.rejects(createLocalUser({ ...credentials, email: "other@example.test" }, true), /owner already exists/);
    assert.equal(await prisma.item.count(), 0);
    assert.equal((await items.GET(request("/api/items"))).status, 401);
    assert.equal((await items.POST(request("/api/items", "POST", { name: "Unauthorized" }))).status, 401);
    assert.equal((await auth("sign-up/email", "POST", credentials)).status, 404);
    assert.equal((await auth("admin/create-user", "POST", credentials)).status, 404);
    assert.equal((await auth("passkey/generate-register-options")).status, 401);
    const login = await auth("sign-in/email", "POST", credentials);
    assert.equal(login.status, 200, await login.clone().text());
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.match(cookie, /session_token=/);
    assert.match(login.headers.getSetCookie().join(";"), /HttpOnly/i);
    const response = await items.POST(request("/api/items", "POST", { name: "Preserved inventory" }, cookie));
    assert.equal(response.status, 201, await response.text());
    assert.equal((await items.GET(request("/api/items", "GET", undefined, cookie))).status, 200);
    const memberData = { name: "Member", email: "member@example.test", password: "member-long-password", role: "admin" };
    const memberResponse = await accounts.POST(request("/api/users", "POST", memberData, cookie));
    assert.equal(memberResponse.status, 201, await memberResponse.clone().text());
    const member = await memberResponse.json(); assert.equal(member.role, "user");
    const memberLogin = await auth("sign-in/email", "POST", memberData);
    assert.equal(memberLogin.status, 200);
    const memberCookie = memberLogin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.equal((await accounts.GET(request("/api/users", "GET", undefined, memberCookie))).status, 403);
    assert.equal((await accounts.PATCH(request("/api/users", "PATCH", { id: member.id, banned: true }, cookie))).status, 200);
    assert.equal((await items.GET(request("/api/items", "GET", undefined, memberCookie))).status, 401);
    assert.equal((await auth("sign-in/email", "POST", memberData)).status, 403);
    const options = await auth("passkey/generate-register-options", "GET", undefined, cookie);
    assert.equal(options.status, 200, await options.clone().text());
    const registration = await options.json();
    assert.equal(registration.rp.id, "localhost");
    assert.equal(registration.authenticatorSelection.userVerification, "required");
    assert.equal(registration.authenticatorSelection.residentKey, "required");
    const authentication = await auth("passkey/generate-authenticate-options");
    assert.equal((await authentication.json()).userVerification, "required");
    const otherKey = await prisma.passkey.create({ data: {
      id: "member-test-key", userId: member.id, publicKey: "test-only-public-key", credentialID: "test-credential", counter: 0, deviceType: "singleDevice", backedUp: false,
    } });
    assert.notEqual((await auth("passkey/delete-passkey", "POST", { id: otherKey.id }, cookie)).status, 200);
    assert.equal(await prisma.passkey.count({ where: { id: otherKey.id } }), 1);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
    await prisma.session.updateMany({ where: { userId: owner.id }, data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } });
    assert.equal((await auth("passkey/generate-register-options", "GET", undefined, cookie)).status, 403);
    const wrongOrigin = await auth("sign-in/email", "POST", credentials, "", { Origin: "http://127.0.0.1:3100" });
    assert.equal(wrongOrigin.status, 403);
    assert.match((await wrongOrigin.json()).message, /Open http:\/\/localhost:3100\/login/);
    assert.equal((await auth("sign-out", "POST", {}, cookie, { Origin: "https://evil.test" })).status, 403);
    const logout = await auth("sign-out", "POST", {}, cookie); assert.equal(logout.status, 200);
    assert.equal((await items.GET(request("/api/items", "GET", undefined, cookie))).status, 401);
    await recoverLocalUser(credentials.email, "recovered-owner-password");
    assert.equal(await prisma.session.count(), 0);
    assert.equal(await prisma.item.count(), 1);
    const recovered = await auth("sign-in/email", "POST", { email: credentials.email, password: "recovered-owner-password" });
    assert.equal(recovered.status, 200);
    const recoveredCookie = recovered.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    await prisma.session.updateMany({ where: { userId: owner.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await items.GET(request("/api/items", "GET", undefined, recoveredCookie))).status, 401);
    let limited = false;
    for (let index = 0; index < 12; index++) {
      const attempt = await auth("sign-in/email", "POST", { email: credentials.email, password: "wrong-password" }, "", { "x-forwarded-for": `192.0.2.${index}`, "x-jeffventory-auth-bucket": `198.51.100.${index}` });
      if (attempt.status === 429) { limited = true; break; }
    }
    assert.equal(limited, true, "Spoofed IP headers must not bypass the global login limit");
  } finally {
    await prisma.$disconnect(); await rm(directory, { recursive: true, force: true });
  }
});
