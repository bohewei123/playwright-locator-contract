import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the locator-contract demo project.
 *
 * The `webServer` block automatically starts the local demo app before tests run
 * and shuts it down when tests finish. No manual `node demo-app/server.js` needed.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',

  /** Run tests in files in parallel */
  fullyParallel: true,

  /** Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /** Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /** Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /** Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  /**
   * Automatically start the demo app before tests.
   * Playwright waits until http://localhost:3000 responds before running any test.
   */
  webServer: {
    command: 'node demo-app/server.js',
    url: 'http://localhost:3000',
    /** Re-use a running server in local dev; always spawn fresh on CI */
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  /** Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /** All page.goto('/some/path') calls resolve against this base URL */
    baseURL: 'http://localhost:3000',

    /** Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /** Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
});
