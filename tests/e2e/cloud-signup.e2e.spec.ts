import { expect, test } from '@playwright/test'

const applicationBaseURL =
  process.env.E2E_BASE_URL?.trim() ||
  process.env.CLOUD_APP_BASE_URL?.trim() ||
  'http://127.0.0.1:3100'

test.describe('LinksetGo Cloud signup', () => {
  test('keeps free signup focused on account details only', async ({ page }) => {
    await page.goto('/signup')

    await expect(page).toHaveURL(new URL('/signup', applicationBaseURL).toString())
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your workspace' }),
    ).toBeVisible()
    await expect(page.getByLabel('Your name')).toBeVisible()
    await expect(page.getByLabel('Work email')).toBeVisible()
    await expect(page.locator('input[name="signup-password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create free workspace' })).toBeVisible()
    await expect(page.getByLabel(/organization|workspace slug|domain|fallback/i)).toHaveCount(0)
    await expect(page.getByText(/no card required/i)).toBeVisible()
  })
})
