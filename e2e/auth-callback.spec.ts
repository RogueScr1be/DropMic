import { expect, test } from '@playwright/test';

test.describe('Supabase auth callback', () => {
  test('handles a callback with no auth payload safely', async ({ page }) => {
    await page.goto('/auth/callback');

    await expect(
      page.getByRole('heading', { name: 'Verification needs a fresh link.' }),
    ).toBeVisible();
    await expect(page.getByText('Unmatched Route')).toHaveCount(0);
  });

  test('handles a provider error callback safely', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_code=otp_expired');

    await expect(
      page.getByRole('heading', { name: 'Verification needs a fresh link.' }),
    ).toBeVisible();
    await expect(page.getByText('invalid or expired', { exact: false })).toBeVisible();
  });

  test('handles a partial callback payload safely', async ({ page }) => {
    await page.goto('/auth/callback#access_token=only-token');

    await expect(
      page.getByRole('heading', { name: 'Verification needs a fresh link.' }),
    ).toBeVisible();
  });
});
