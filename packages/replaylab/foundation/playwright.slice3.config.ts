import { defineConfig } from '@playwright/test';

import base from './playwright.config';

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    baseURL: 'http://127.0.0.1:32410',
  },
  webServer: {
    command:
      'node ../../../node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 32410 --strictPort',
    port: 32410,
    reuseExistingServer: false,
  },
});
