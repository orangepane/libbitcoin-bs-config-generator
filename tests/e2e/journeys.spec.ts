import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Four product promises, not rendering checks: preset to file, an invalid value
// named, import and re-export, and the artifact on a phone.

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('preset to downloaded file in three interactions', async ({ page }) => {
  await page.getByRole('button', { name: 'Apply Wallet server' }).click();
  await page.getByRole('button', { name: 'Download bs.cfg' }).click();

  // The preset exposes an interface on all addresses without TLS. The warning
  // is read once more before the file is saved; it does not block the save.
  await expect(page.getByRole('dialog')).toContainText('electrum.bind');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download anyway' }).click();
  const download = await downloaded;

  expect(download.suggestedFilename()).toBe('bs.cfg');
  const path = await download.path();
  expect(path).not.toBeNull();
  if (!path) return;

  const text = await readFile(path, 'utf8');
  expect(text).toContain('[electrum]');
  expect(text).toContain('bind = 0.0.0.0:8580');
  expect(text).toContain('# IP address to bind (empty disables).');
});

test('an out-of-range value is named in the row and in the download', async ({ page }) => {
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('maximum_size');

  const row = page.locator('[data-row="log.maximum_size"]');
  await expect(row).toBeVisible();

  const input = row.getByRole('textbox');
  await input.fill('-5');
  await input.press('Enter');

  await expect(row).toHaveAttribute('data-state', 'invalid');
  await expect(row).toContainText('Must be at least 0');

  await page.getByRole('button', { name: 'Download bs.cfg' }).click();
  await expect(page.getByRole('dialog')).toContainText('log.maximum_size is -5');
  await expect(page.getByRole('button', { name: 'Download anyway' })).toBeEnabled();
});

test('undo restores the draft before a preset', async ({ page }) => {
  await page.goto('./');

  await page.getByRole('button', { name: 'Apply Tor privacy' }).click();
  const undo = page.getByRole('button', { name: 'Undo apply Tor privacy' });
  await expect(undo).toBeVisible();

  await undo.click();
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(0);
  await expect(page.locator('.artifact-body')).toContainText('All values are at defaults');
  await expect(page.locator('.meta-chip').filter({ hasText: '0 settings changed' })).toBeVisible();
});

test('an imported file re-exports byte-identically', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.getByRole('button', { name: 'Apply Tor privacy' }).click();
  await page.getByRole('button', { name: 'Copy' }).click();

  const before = await page.evaluate(() => navigator.clipboard.readText());
  expect(before).toContain('[outbound]');
  expect(before).toContain('socks = 127.0.0.1:9050');

  await page.getByRole('button', { name: 'Import' }).first().click();
  await page.getByRole('dialog').locator('textarea').fill(before);
  await page.getByRole('dialog').getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Copy' }).click();
  const after = await page.evaluate(() => navigator.clipboard.readText());
  expect(after).toBe(before);
});

test('the artifact is reachable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');

  const bar = page.locator('.mobile-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('0 changed');

  await page.getByRole('button', { name: 'Open bs.cfg to copy or download it' }).click();
  const sheet = page.getByRole('dialog', { name: 'bs.cfg' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Download bs.cfg' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Share' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
