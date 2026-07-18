import { expect, test } from '@playwright/test';

test('records, plays, retries, and deletes a local browser recording', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MicDrop audio proof' })).toBeVisible();

  await page.getByRole('button', { name: 'Request microphone permission' }).click();
  await expect(page.getByText('ready')).toBeVisible();

  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();

  await expect(page.getByRole('heading', { name: 'Recording complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Play recording' }).click();
  await page.getByRole('button', { name: 'Delete recording' }).click();
  await expect(page.getByText('idle')).toBeVisible();

  await page.getByRole('button', { name: 'Request microphone permission' }).click();
  await expect(page.getByText('ready')).toBeVisible();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByRole('heading', { name: 'Recording complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry recording' }).click();
  await expect(page.getByText('ready')).toBeVisible();
});
