import { test } from "node:test";
import assert from "node:assert/strict";
import { authConfig } from "../src/lib/auth-config";

test("authentication configuration fails closed and pins a single secure origin", () => {
  const oldSecret = process.env.BETTER_AUTH_SECRET;
  const oldURL = process.env.BETTER_AUTH_URL;
  try {
    delete process.env.BETTER_AUTH_SECRET;
    assert.throws(authConfig, /BETTER_AUTH_SECRET/);
    process.env.BETTER_AUTH_SECRET = "test-only-secret-which-is-over-32-characters";
    for (const value of ["http://inventory.example", "https://user:pass@inventory.example", "https://inventory.example/path", "https://inventory.example?redirect=evil", "ftp://localhost"]) {
      process.env.BETTER_AUTH_URL = value;
      assert.throws(authConfig);
    }
    process.env.BETTER_AUTH_URL = "https://inventory.home.arpa:8443";
    assert.deepEqual(authConfig(), { secret: process.env.BETTER_AUTH_SECRET, origin: "https://inventory.home.arpa:8443", rpID: "inventory.home.arpa", secure: true });
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    assert.equal(authConfig().secure, false);
  } finally {
    if (oldSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = oldSecret;
    if (oldURL === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = oldURL;
  }
});
