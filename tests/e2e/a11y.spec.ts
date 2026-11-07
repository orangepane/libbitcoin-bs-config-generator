import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Accessibility is part of the product contract (C7). The audit runs on all
// three tiers, with the artifact pane present, and must report nothing.

const tiers = ['Start', 'Essentials', 'All'] as const;

for (const tier of tiers) {
  test(`axe: ${tier} has no violations`, async ({ page }) => {
    await page.goto('./');
    if (tier !== 'Start') await page.getByRole('button', { name: tier, exact: true }).click();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    const summary = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));

    expect(summary).toEqual([]);
  });
}

// An empty artifact hides most of the pane: no lines means no clickable rows.
// Audit a draft with content, or the target-size rule is never exercised.
test('axe: a filled artifact has no violations', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Apply Wallet server' }).click();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
});
