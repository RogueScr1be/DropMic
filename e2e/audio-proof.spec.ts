import { expect, test } from '@playwright/test';

test('records, plays, retries, and deletes a local browser recording', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MicDrop audio proof' })).toBeVisible();

  await page.getByRole('button', { name: 'Request microphone permission' }).click();
  await expect(page.getByText('ready')).toBeVisible();

  await page.getByRole('radio', { name: '30 seconds' }).click();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Recording complete' })).toBeVisible({ timeout: 40_000 });
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
  await page.getByRole('button', { name: 'Delete recording' }).click();
  await expect(page.getByText('idle')).toBeVisible();

  await page.getByRole('button', { name: 'Request microphone permission' }).click();
  await expect(page.getByText('ready')).toBeVisible();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('interrupted', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry recording' }).click();
  await expect(page.getByText('ready')).toBeVisible();

  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByRole('heading', { name: 'Recording complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry recording' }).click();
  await expect(page.getByText('ready')).toBeVisible();
});
