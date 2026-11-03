import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";

async function main() {
  const root = resolve(".test-data");
  await mkdir(root, { recursive: true });
  const runDirectory = await mkdtemp(join(root, "run-"));
  const env = {
    ...process.env,
    DATABASE_URL: `file:${join(runDirectory, "inventory.db")}`,
    UPLOAD_DIR: join(runDirectory, "uploads"),
    NEXT_TELEMETRY_DISABLED: "1",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`,
  };
  const migration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], { env, stdio: "inherit" });
  if (migration.error || migration.status !== 0) {
    await rm(runDirectory, { recursive: true, force: true });
    throw migration.error ?? new Error(`Test database migration failed (${migration.status}).`);
  }
  const account = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/manage-users.ts", "create-owner", "owner@example.test", "Test owner", "--password-stdin"], {
    env, input: "Test-owner-password-2026\n", encoding: "utf8",
  });
  if (account.error || account.status !== 0) {
    await rm(runDirectory, { recursive: true, force: true });
    throw account.error ?? new Error(`Test account setup failed: ${account.stderr}`);
  }
  const child = spawn(process.execPath, [
    resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1",
    "--port", process.env.PLAYWRIGHT_PORT ?? "3100",
  ], { env, stdio: "inherit" });
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    await rm(runDirectory, { recursive: true, force: true });
  };
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => { void shutdown().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); }); });
  }
  child.once("error", (error) => {
    console.error(error);
    void shutdown().then(() => process.exit(1));
  });
  child.once("exit", (code) => {
    if (!stopping) void shutdown().then(() => process.exit(code ?? 1));
  });
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
