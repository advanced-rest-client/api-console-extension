// @ts-check
import { devices } from '@playwright/test';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const pathToExtension = dirname(fileURLToPath(import.meta.url));

/** @typedef {import('@playwright/test').PlaywrightTestConfig} PlaywrightTestConfig */

export default /** @type PlaywrightTestConfig */ ({
  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  use: {
    trace: 'on-first-retry',
    baseURL: 'http://localhost:8000/demo/',
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`
    ],
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
      },
    },
  ],

  testMatch: /\/test\/.*\.test\.js/,

  webServer: {
    command: 'npx wds --port=8000',
    url: 'http://localhost:8000/demo/',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
