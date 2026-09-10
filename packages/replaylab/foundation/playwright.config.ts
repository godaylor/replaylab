import { defineConfig } from '@playwright/test';

const previewPort = Number(process.env.REPLAYLAB_PREVIEW_PORT ?? 32410);
if (!Number.isInteger(previewPort) || previewPort < 32400 || previewPort > 32499) {
  throw new Error('ReplayLab test ports must be within 32400-32499');
}

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.pw.spec.ts', '**/*.e2e.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: process.env.REPLAYLAB_TEST_REPORT ?? 'evidence/release-tests.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    headless: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    storageState: {
      cookies: [],
      origins: [{
        origin: `http://127.0.0.1:${previewPort}`,
        localStorage: [{ name: 'replaylab:locale', value: 'en' }],
      }],
    },
  },
  webServer: {
    command: `node ../../../node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
    port: previewPort,
    reuseExistingServer: false,
  },
});
