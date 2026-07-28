import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

const baseURL =
  process.env.E2E_BASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  'http://127.0.0.1:3100'

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Payload user sessions are rotated on login. E2E tests share one seeded
  // account, so parallel logins can invalidate each other's session records.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
})
