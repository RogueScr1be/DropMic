import { expect, test } from '@playwright/test';

test('runs the local first-use loop and keeps the recording on-device', async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto('/');

  await expect(page.getByTestId('topic-reveal')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('duration-selection')).toBeVisible({ timeout: 8_000 });
  await page.getByRole('radio', { name: '30 seconds' }).click();
  await page.getByRole('button', { name: 'Start speaking' }).click();
  await expect(page.getByRole('button', { name: 'Cancel countdown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 5_000 });

  await expect(page.getByRole('heading', { name: 'That’s a take.' })).toBeVisible({ timeout: 40_000 });
  const recordingUri = await page.getByTestId('recording-uri').textContent();
  expect(recordingUri).toMatch(/^blob:/);
  const recordingMetadata = await page.evaluate(async (uri) => {
    const response = await fetch(uri ?? '');
    const blob = await response.blob();
    return { mimeType: blob.type, size: blob.size };
  }, recordingUri);
  expect(recordingMetadata.size).toBeGreaterThan(0);
  expect(recordingMetadata.mimeType).toMatch(/^audio\//);

  await page.getByRole('button', { name: 'Play recording' }).click();
  await page.getByRole('button', { name: 'Get a Quick Read' }).click();
  await expect(page.getByText('Quick Read is coming soon.')).toBeVisible();

  await page.getByRole('button', { name: 'Delete recording' }).click();
  await expect(page.getByTestId('topic-reveal')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId('duration-selection')).toBeVisible({ timeout: 8_000 });

  await page.getByRole('radio', { name: '30 seconds' }).click();
  await page.getByRole('button', { name: 'Start speaking' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 5_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading', { name: 'A pause, not a problem.' })).toBeVisible({ timeout: 5_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.getByRole('button', { name: 'Try this prompt again' }).click();
  await expect(page.getByTestId('duration-selection')).toBeVisible({ timeout: 8_000 });
  await page.getByRole('radio', { name: '30 seconds' }).click();
  await page.getByRole('button', { name: 'Start speaking' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByRole('heading', { name: 'That’s a take.' })).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Retry recording' }).click();
  await expect(page.getByTestId('duration-selection')).toBeVisible({ timeout: 8_000 });
});
