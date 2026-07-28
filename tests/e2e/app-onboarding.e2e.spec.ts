import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

test.describe('guided app onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await login({ page })
  })

  test('creates an iOS app as a workspace-scoped draft', async ({ page }) => {
    await page.goto('/admin/apps')
    await page.getByRole('button', { name: 'Add app' }).click()
    await expect(page).toHaveURL(/\/admin\/apps\/new$/)

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Enter the name people use for this app.')).toBeVisible()

    await page.getByLabel('App name').fill('Oberoi Mall')
    await expect(page.getByLabel('Permanent app key')).toHaveValue('oberoi-mall')
    await page.getByLabel('Native URL scheme').fill('oberoi')
    await page.getByLabel('Internal description').fill('Offers, loyalty and mall navigation')
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('radio', { name: /^iOS\b/ }).check()
    await page.getByLabel('iOS Bundle ID').fill('com.oberoimall.app')
    await page.getByLabel('Apple Team ID').fill('a1b2c3d4e5')
    await expect(page.getByLabel('Apple Team ID')).toHaveValue('A1B2C3D4E5')
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByLabel('Default web fallback').fill('https://www.oberoimall.com/download')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Create a safe draft' })).toBeVisible()
    await expect(page.getByText('A1B2C3D4E5.com.oberoimall.app')).toBeVisible()

    let submittedWorkspace: unknown
    await page.route('**/api/apps', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      const input = route.request().postDataJSON() as Record<string, unknown>
      submittedWorkspace = input.workspace
      expect(input).toMatchObject({
        fallbackUrl: 'https://www.oberoimall.com/download',
        iosBundleId: 'com.oberoimall.app',
        iosTeamId: 'A1B2C3D4E5',
        name: 'Oberoi Mall',
        nativeScheme: 'oberoi',
        slug: 'oberoi-mall',
        status: 'draft',
      })
      expect(input).not.toHaveProperty('androidPackageName')
      await route.fulfill({
        body: JSON.stringify({ ...input, id: 999 }),
        contentType: 'application/json',
        status: 200,
      })
    })

    await page.getByRole('button', { name: 'Create draft app' }).click()
    await expect(page.getByRole('heading', { name: 'Oberoi Mall is safely offline' })).toBeVisible()
    expect(submittedWorkspace).toBeTruthy()
    await expect(page.getByRole('button', { name: 'Review draft settings' })).toBeVisible()
  })
})
