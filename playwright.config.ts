import { defineConfig, devices } from '@playwright/test';

const chrome = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: {
    baseURL: 'http://localhost:4173/',
    launchOptions: { executablePath: chrome },
    acceptDownloads: true,
  },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 } } },
    { name: 'iphone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', launchOptions: { executablePath: chrome } } },
  ],
});
