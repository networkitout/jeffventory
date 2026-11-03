import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--no-build")) throw new Error("Usage: npm run test:docker -- [--no-build]");
const noBuild = args.includes("--no-build");
const project = `jeffventory-test-${randomUUID().slice(0, 8)}`;
const restoredProject = `${project}-restore`;
const image = noBuild ? (process.env.JEFFVENTORY_TEST_IMAGE || "jeffventory:local") : `${project}:local`;
const env = {
  ...process.env,
  JEFFVENTORY_IMAGE: image,
  JEFFVENTORY_BIND_ADDRESS: "127.0.0.1",
  JEFFVENTORY_PORT: "0",
  JEFFVENTORY_HOSTNAME: "localhost",
  JEFFVENTORY_HTTPS_PORT: "0",
};

function docker(args, { input, binary = false, timeout = 300000 } = {}) {
  const result = spawnSync("docker", args, {
    env, input, encoding: binary ? "buffer" : "utf8", timeout, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function compose(name, args, { https = false, ...options } = {}) {
  return docker([
    "compose", "--project-name", name, "-f", "compose.yaml",
    ...(https ? ["-f", "compose.https.yaml"] : []), ...args,
  ], options);
}

function publishedPort(name, service, target, https = false) {
  const address = compose(name, ["port", service, String(target)], { https }).trim();
  assert.match(address, /^127\.0\.0\.1:\d+$/);
  return Number(address.split(":").at(-1));
}

async function json(base, path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(10000) });
  const body = await response.text();
  assert.equal(response.status, expectedStatus, body);
  return JSON.parse(body);
}

async function photoDigest(base, id) {
  const response = await fetch(`${base}/api/photos/${id}`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  return createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex");
}

function trustedRequest(port, ca, path, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      hostname: "127.0.0.1", servername: "localhost", port, path, ca, method, timeout: 10000,
      headers: {
        Host: `localhost:${port}`,
        ...(body ? {
          Origin: `https://localhost:${port}`, "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("HTTPS request timed out.")));
    request.end(body);
  });
}

async function eventually(operation) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }
  throw lastError;
}

async function main() {
  docker(["info", "--format", "{{.OSType}}"]);
  const root = resolve(".test-data");
  await mkdir(root, { recursive: true });
  const temporary = await mkdtemp(join(root, "compose-"));
  let browser;
  try {
    console.log("Starting an isolated Compose deployment...");
    if (!noBuild) compose(project, ["build", "app"]);
    const config = JSON.parse(compose(project, ["config", "--format", "json"]));
    assert.equal(config.services.app.ports[0].host_ip, "127.0.0.1");
    compose(project, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "180"]);
    let base = `http://127.0.0.1:${publishedPort(project, "app", 3000)}`;
    assert.deepEqual(await json(base, "/api/health"), { status: "ok" });
    assert.deepEqual(await json(base, "/api/items"), []);
    assert.equal(compose(project, ["exec", "-T", "app", "id", "-u"]).trim(), "1000");
    compose(project, ["exec", "-T", "app", "node", "-e",
      "const fs=require('node:fs'); if(fs.existsSync('/app/.env') || fs.existsSync('/app/prisma/dev.db')) process.exit(1);"]);

    const item = await json(base, "/api/items", {
      method: "POST", headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Docker persistence fixture", upc: "012345678905", quantity: 4 }),
    }, 201);
    const png = await fetch(`${base}/api/barcode?text=${item.sku}&type=qrcode`);
    assert.equal(png.status, 200);
    const upload = new FormData();
    upload.append("files", new Blob([await png.arrayBuffer()], { type: "image/png" }), "fixture.png");
    const [photo] = await json(base, `/api/items/${item.id}/photos`, {
      method: "POST", body: upload, headers: { Origin: base },
    }, 201);
    const digest = await photoDigest(base, photo.id);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${base}/items/new`);
    await page.getByLabel("Item name", { exact: false }).fill("Created through container UI");
    await page.getByRole("button", { name: "Create item", exact: true }).click();
    await page.waitForURL(/\/items\/c[a-z0-9]+$/);
    await page.getByRole("heading", { name: "Created through container UI", exact: true }).waitFor();
    await page.goto(`${base}/labels?ids=${item.id}`);
    await page.locator(".label-grid img").evaluate((image) => image.decode());
    await browser.close();
    browser = undefined;

    compose(project, ["up", "-d", "--no-build", "--force-recreate", "--wait", "--wait-timeout", "180", "app"]);
    base = `http://127.0.0.1:${publishedPort(project, "app", 3000)}`;
    assert.equal((await json(base, `/api/items/${item.id}`)).quantity, 4);
    assert.equal(await photoDigest(base, photo.id), digest);
    console.log("Fresh migrations, non-root runtime, UI, photos, labels, and recreate persistence passed.");

    compose(project, ["stop", "app"]);
    const backup = compose(project, ["run", "--rm", "-T", "--no-deps", "--entrypoint", "tar", "app", "-C", "/data", "-czf", "-", "."], { binary: true });
    await writeFile(join(temporary, "inventory.tgz"), backup);
    compose(restoredProject, ["run", "--rm", "-T", "--no-deps", "--entrypoint", "sh", "app",
      "-c", "test ! -e /data/inventory.db && tar -xzf - -C /data"], { input: backup });
    compose(restoredProject, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "180"]);
    const restoredBase = `http://127.0.0.1:${publishedPort(restoredProject, "app", 3000)}`;
    assert.equal((await json(restoredBase, `/api/items/${item.id}`)).upc, "012345678905");
    assert.equal(await photoDigest(restoredBase, photo.id), digest);
    console.log("Stopped-volume backup and restoration into a separate deployment passed.");

    const secureConfig = JSON.parse(compose(project, ["config", "--format", "json"], { https: true }));
    assert.equal(secureConfig.services.app.ports, undefined);
    assert.equal(secureConfig.services.https.ports[0].host_ip, "127.0.0.1");
    compose(project, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "180"], { https: true });
    const port = publishedPort(project, "https", 443, true);
    const rootPath = join(temporary, "root.crt");
    await eventually(async () => {
      compose(project, ["cp", "https:/data/caddy/pki/authorities/local/root.crt", rootPath], { https: true });
      const health = await trustedRequest(port, await readFile(rootPath), "/api/health");
      assert.equal(health.status, 200);
    });
    const secureWrite = await trustedRequest(port, await readFile(rootPath), `/api/items/${item.id}/quantity`, {
      method: "POST", body: JSON.stringify({ delta: 1 }),
    });
    assert.equal(secureWrite.status, 200, JSON.stringify(secureWrite.body));
    assert.equal(secureWrite.body.quantity, 5);
    const originalCA = await readFile(rootPath);
    compose(project, ["up", "-d", "--no-build", "--no-deps", "--force-recreate", "https"], { https: true });
    const recreatedPort = publishedPort(project, "https", 443, true);
    await eventually(async () => {
      assert.equal((await trustedRequest(recreatedPort, originalCA, "/api/health")).status, 200);
    });
    compose(project, ["stop", "https"], { https: true });
    const certificates = compose(project, ["run", "--rm", "-T", "--no-deps", "--entrypoint", "tar",
      "https", "-C", "/data", "-czf", "-", "."], { https: true, binary: true });
    compose(restoredProject, ["run", "--rm", "-T", "--no-deps", "--entrypoint", "sh", "https",
      "-c", "test ! -e /data/caddy/pki/authorities/local/root.key && tar -xzf - -C /data"],
    { https: true, input: certificates });
    compose(restoredProject, ["up", "-d", "--no-build", "--wait", "--wait-timeout", "180"], { https: true });
    const restoredSecurePort = publishedPort(restoredProject, "https", 443, true);
    await eventually(async () => {
      const restored = await trustedRequest(restoredSecurePort, originalCA, `/api/items/${item.id}`);
      assert.equal(restored.status, 200);
      assert.equal(restored.body.quantity, 4);
      assert.equal(restored.body.photos[0].id, photo.id);
    });
    console.log("Private HTTPS, persistent/restored CA trust, and same-origin proxy writes passed.");
  } finally {
    await browser?.close();
    try {
      compose(project, ["down", "--volumes", "--remove-orphans"], { https: true });
      compose(restoredProject, ["down", "--volumes", "--remove-orphans"], { https: true });
      if (!noBuild) docker(["image", "rm", image]);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
