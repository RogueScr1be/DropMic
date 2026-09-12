import { expect, test } from '@playwright/test';

async function acceptAgeGate(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('age-gate')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('checkbox', { name: 'I confirm I am 13 or older' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('topic-reveal')).toBeVisible();
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page, name: string) {
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth, `${name} width overflow`).toBeLessThanOrEqual(layout.clientWidth + 1);
}

test('keeps first use gated, user-driven, and stable through responsive changes', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      externalRequests.push(request.url());
    }
  });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/');
  await acceptAgeGate(page);

  const initialPrompt = await page.getByLabel(/^Speaking prompt:/).getAttribute('aria-label');
  await page.waitForTimeout(5_000);
  await expect(page.getByTestId('topic-reveal')).toBeVisible();
  await expect(page.getByTestId('duration-selection')).toBeHidden();

  const requestsBeforeNewDrop = await page.evaluate(() => performance.getEntriesByType('resource').length);
  await page.getByRole('button', { name: 'New Drop!' }).click();
  await expect(page.getByLabel(/^Speaking prompt:/)).not.toHaveAttribute('aria-label', initialPrompt ?? '');
  expect(await page.evaluate(() => performance.getEntriesByType('resource').length)).toBe(requestsBeforeNewDrop);

  const selectedPrompt = await page.getByLabel(/^Speaking prompt:/).getAttribute('aria-label');
  const primaryColor = await page.getByRole('button', { name: 'Let’s Go!' }).evaluate((node) => getComputedStyle(node).backgroundColor);
  const secondaryColor = await page.getByRole('button', { name: 'New Drop!' }).evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(primaryColor).not.toBe(secondaryColor);

  await expect(page.getByRole('switch', { name: /reveal sound/i })).toHaveCount(0);
  await expect(page.getByText(/clack \/ (on|off)/i)).toHaveCount(0);
  await expect(page.getByText(/drop ready/i)).toHaveCount(0);
  await expect(page.getByTestId(/^solari-row-/)).toHaveCount(5);
  await expect(page.getByTestId(/^solari-tile-/)).toHaveCount(50);
  const flowToggle = page.getByRole('button', { name: 'Expand Mic Flow details' });
  await expect(flowToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('mic-flow-details')).toBeHidden();

  const requestsBeforeFlowToggle = await page.evaluate(() => performance.getEntriesByType('resource').length);
  await flowToggle.click();
  await expect(page.getByRole('button', { name: 'Collapse Mic Flow details' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('mic-flow-details')).toBeVisible();
  expect(await page.evaluate(() => performance.getEntriesByType('resource').length)).toBe(requestsBeforeFlowToggle);

  await page.setViewportSize({ height: 1194, width: 834 });
  await expect.poll(async () => (await page.getByTestId('primary-region').boundingBox())?.width).toBeGreaterThan(700);
  await expect.poll(async () => (await page.getByTestId('flow-region').boundingBox())?.width).toBeGreaterThan(700);

  await page.setViewportSize({ height: 834, width: 1194 });
  const landscapePrimary = await page.getByTestId('primary-region').boundingBox();
  const landscapeFlow = await page.getByTestId('flow-region').boundingBox();
  const landscapeBoard = await page.getByLabel(/^Speaking prompt:/).boundingBox();
  const landscapeAction = await page.getByRole('button', { name: 'Let’s Go!' }).boundingBox();
  const landscapeViewport = page.viewportSize();
  expect(landscapePrimary?.width).toBeGreaterThan(900);
  expect(landscapeFlow?.width).toBeGreaterThan(900);
  expect(landscapePrimary?.width).toBeGreaterThan((landscapeViewport?.width ?? 0) * 0.75);
  expect(landscapeFlow?.width).toBeGreaterThan((landscapeViewport?.width ?? 0) * 0.75);
  expect(landscapeBoard?.width).toBeGreaterThan((landscapePrimary?.width ?? 0) * 0.8);
  expect(landscapeFlow?.x).toBeLessThanOrEqual((landscapeBoard?.x ?? 0) + 1);
  expect((landscapeFlow?.x ?? 0) + (landscapeFlow?.width ?? 0)).toBeLessThanOrEqual(
    (landscapeViewport?.width ?? 0) + 1,
  );
  expect((landscapeFlow?.x ?? 0) + (landscapeFlow?.width ?? 0)).toBeGreaterThanOrEqual(
    (landscapeBoard?.x ?? 0) + (landscapeBoard?.width ?? 0) - 1,
  );
  expect(landscapeFlow?.y).toBeGreaterThan((landscapeBoard?.y ?? 0) + (landscapeBoard?.height ?? 0));
  expect(landscapeAction?.y).toBeGreaterThan((landscapeFlow?.y ?? 0) + (landscapeFlow?.height ?? 0));
  await expect(page.getByRole('button', { name: 'Collapse Mic Flow details' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Let’s Go!' })).toBeVisible();

  await page.setViewportSize({ height: 844, width: 390 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Collapse Mic Flow details' }).click();
  await expect(page.getByRole('button', { name: 'Expand Mic Flow details' })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'Let’s Go!' }).click();
  await expect(page.getByRole('radio', { name: '30 seconds' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '60 seconds' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: '90 seconds' })).toBeVisible();
  await page.getByRole('radio', { name: '90 seconds' }).click();
  await expect(page.getByRole('radio', { name: '90 seconds' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('duration-picker').getByText('✓')).toHaveCount(0);
  await expect(page.getByTestId('duration-picker').locator('[aria-checked="true"]')).toHaveCount(1);

  for (const viewport of [
    { height: 844, name: 'iPhone portrait', width: 390 },
    { height: 390, name: 'iPhone landscape', width: 844 },
    { height: 1194, name: 'iPad portrait', width: 834 },
    { height: 834, name: 'iPad landscape', width: 1194 },
    { height: 390, name: 'large-text reflow', width: 650 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByTestId('duration-selection')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Let’s Go!' })).toBeVisible();
    await expect(page.getByRole('radio', { name: '90 seconds' })).toHaveAttribute('aria-checked', 'true');
    await expectNoHorizontalOverflow(page, viewport.name);
  }

  await page.getByRole('button', { name: 'Back to prompt' }).click();
  await expect(page.getByLabel(/^Speaking prompt:/)).toHaveAttribute('aria-label', selectedPrompt ?? '');

  await page.reload();
  await expect(page.getByTestId('age-gate')).toBeHidden({ timeout: 5_000 });
  await expect(page.getByTestId('topic-reveal')).toBeVisible();
  expect(externalRequests).toEqual([]);
});
