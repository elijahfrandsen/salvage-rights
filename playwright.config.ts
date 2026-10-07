import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  outputDir:
    process.env.E2E_NORMAL === "1"
      ? "test-results/normal"
      : "test-results/fast",
  timeout: process.env.E2E_NORMAL === "1" ? 300000 : 90000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/e2eServer.mjs",
    port: 3100,
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: "list",
});
