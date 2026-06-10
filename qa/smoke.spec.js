const { test, expect } = require('@playwright/test');

test('page loads without console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/index.html');
  const title = await page.title();
  expect(title.trim().length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
