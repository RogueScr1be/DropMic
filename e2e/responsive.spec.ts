import { expect, test } from '@playwright/test';

test('keeps the first-use shell within phone, tablet, and desktop widths', async ({ page }) => {
  for (const viewport of [
    { height: 844, name: 'phone', width: 390 },
    { height: 1112, name: 'tablet', width: 834 },
    { height: 900, name: 'desktop', width: 1440 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByTestId('topic-reveal')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('duration-selection')).toBeVisible({ timeout: 8_000 });

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth, `${viewport.name} width overflow`).toBeLessThanOrEqual(layout.clientWidth + 1);
  }
});
