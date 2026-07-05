import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 60_000,
  workers: 2,
  // CI 上重试一次：双核慢机的时序余量，且首个重试会带 trace（见 use.trace）
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /visual\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      testIgnore: /visual\.spec\.ts$/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      testIgnore: /visual\.spec\.ts$/,
      use: { ...devices['iPhone 14'] },
    },
    {
      // 视觉回归（npm run test:visual，仅本地）：基线含平台后缀，只在开发机有效；
      // CI 只跑 --project=chromium 功能项目，不会执行本项目
      name: 'visual',
      testMatch: /visual\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      },
    },
  ],
})
