import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PLAYWRIGHT_PORT must be a port from 1024 to 65535.");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 45000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: "**/mobile.spec.ts", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", testMatch: "**/mobile.spec.ts", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "npm run test:serve",
    url: `http://127.0.0.1:${port}/api/items`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
    timeout: 120000,
    env: { PLAYWRIGHT_PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" },
  },
});
