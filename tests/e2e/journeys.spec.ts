import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Four product promises: preset to file, an invalid value named, import and
// re-export, and the artifact on a phone.

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

// A note is not a risk. Nothing stands between the reader and a normal save.
test('a note does not interrupt the download', async ({ page }) => {
  await page.getByRole('button', { name: 'Apply Full validation from genesis' }).click();
  await expect(page.getByText('1 note')).toBeVisible();

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download bs.cfg' }).click();
  await downloaded;

  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('preset to downloaded file in two interactions', async ({ page }) => {
  await page.getByRole('button', { name: 'Apply Wallet server' }).click();

  // The preset listens on loopback, so nothing stands between the reader and
  // the file.
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download bs.cfg' }).click();
  const download = await downloaded;

  expect(download.suggestedFilename()).toBe('bs.cfg');
  const path = await download.path();
  expect(path).not.toBeNull();
  if (!path) return;

  const text = await readFile(path, 'utf8');
  expect(text).toContain('[electrum]');
  expect(text).toContain('bind = 127.0.0.1');
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

// The network is the frame: a file always names it, and a file this tool wrote
// must come back unchanged. Importing is where a wrong baseline hides, because
// nothing on screen looks wrong until the next download.
const NETWORKS = ['mainnet', 'testnet3', 'testnet4', 'signet', 'regtest'];

async function downloadText (page) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download bs.cfg' }).click();
  const download = await downloaded;
  return readFile(await download.path(), 'utf8');
}

async function importText (page, text) {
  await page.getByRole('button', { name: 'Import a file' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('textarea').first().fill(text);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.keyboard.press('Escape');
}

for (const network of NETWORKS) {
  test(`a downloaded file re-imports unchanged on ${network}`, async ({ page }) => {
    if (network !== 'mainnet') await page.getByRole('combobox').selectOption(network);
    await page.getByRole('button', { name: 'Apply Wallet server' }).click();

    const first = await downloadText(page);
    await importText(page, first);

    expect(await downloadText(page)).toBe(first);
  });
}

test('a switch to another network writes only that network', async ({ page }) => {
  // The tree used to keep the old network's chain parameters, milestone and
  // table counts, so a bare switch wrote dozens of stale values.
  await page.getByRole('combobox').selectOption('testnet4');

  const text = await downloadText(page);
  const emitted = text.split('\n').filter((line) => line !== '' && !line.startsWith('#'));

  expect(emitted).toEqual(['[bitcoin]', 'network = testnet4']);
});

test('a file that names another network imports onto that network', async ({ page }) => {
  await page.getByRole('combobox').selectOption('regtest');
  await page.getByRole('button', { name: 'Apply Local admin' }).click();
  const source = await downloadText(page);

  await page.goto('./');
  await importText(page, source);

  expect(await downloadText(page)).toBe(source);
});
