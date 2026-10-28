import { defineConfig } from "@playwright/test";

export const FIXTURE_ORIGIN = "http://127.0.0.1:4317";

export default defineConfig({
  testDir: "./e2e-tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { trace: "on-first-retry" },
  webServer: {
    command: "node e2e-tests/serve-fixtures.ts",
    url: `${FIXTURE_ORIGIN}/docs.html`,
    reuseExistingServer: true,
  },
});
