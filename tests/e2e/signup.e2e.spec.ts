import { expect, test } from '@playwright/test'

test.describe('public signup safety', () => {
  test('keeps Relay Community signup unavailable', async ({ page }) => {
    await page.goto('/signup')

    await expect(page.getByRole('heading', { name: 'Signup is not available' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
      'href',
      '/admin/login',
    )
  })
})
