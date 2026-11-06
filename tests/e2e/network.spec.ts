import { test, expect } from '@playwright/test';

// Product contract C2: the page makes no third-party requests at runtime. The
// claim is checked in a real browser, not by grepping the source.

test('loads nothing from another origin', async ({ page, baseURL }) => {
  const foreign: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (baseURL && url.startsWith(baseURL)) return;
    foreign.push(url);
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('socks');
  await page.waitForLoadState('networkidle');

  expect(foreign).toEqual([]);
});
