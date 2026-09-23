import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // Native focus/blur checks share the OS desktop with the browser project.
  workers: 1,
  timeout: 45000,
  expect: { timeout: 8000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "browser",
      testMatch: "**/browser.spec.ts",
      use: { channel: "chrome" },
    },
    { name: "electron", testMatch: "**/electron.spec.ts" },
  ],
  webServer: {
    command: "bun run desktop:preview --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
