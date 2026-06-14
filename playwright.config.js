const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './qa',
  timeout: 30000,
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: 'http://localhost:7771',
  },
});
