import { defineConfig, devices } from "@playwright/test";

/**
 * 最小 Playwright Test 配置。
 * 跑生成产物：把 playwright.spec.ts 放到 tests/ 后执行
 *   npx playwright test
 * 或指定文件：
 *   npx playwright test tests/playwright.spec.ts
 *
 * 若用例针对外部原型，可临时覆盖：
 *   set PLAYWRIGHT_BASE_URL=https://你的原型地址
 *   npx playwright test
 */

const isSmoke = !!process.env.SMOKE_RUN_DIR;
const isHeadedSmoke = isSmoke && process.argv.includes("--headed");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // 冒烟绝不能自动 open/serve HTML 报告，否则会弹 9323 页面并卡住进程
  reporter: [
    ["line"],
    [
      "html",
      {
        open: "never",
        ...(process.env.PLAYWRIGHT_HTML_REPORT
          ? { outputFolder: process.env.PLAYWRIGHT_HTML_REPORT }
          : {}),
      },
    ],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "zh-CN",
    ...(isHeadedSmoke
      ? {
          viewport: { width: 1920, height: 1080 },
          deviceScaleFactor: 1,
          launchOptions: {
            args: ["--start-maximized", "--window-position=0,0"],
          },
        }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: isHeadedSmoke
        ? {
            browserName: "chromium",
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 1,
            launchOptions: {
              args: ["--start-maximized", "--window-position=0,0"],
            },
          }
        : { ...devices["Desktop Chrome"] },
    },
  ],
});
