import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { seededApp, seededLink } from '../helpers/sample-fixtures'

test.describe('workspace app management', () => {
  test.beforeEach(async ({ page }) => {
    await login({ page })
  })

  test('opens the app console with readiness, immutable identity and runtime link preview', async ({
    page,
  }) => {
    await page.goto('/admin/apps')
    const appCard = page
      .locator('article')
      .filter({ has: page.getByText(seededApp.slug, { exact: true }) })
      .first()
    await appCard.getByRole('link').click()

    await expect(page).toHaveURL(/\/admin\/apps\/[^/]+$/)
    await expect(page.getByRole('heading', { level: 1, name: seededApp.name })).toBeVisible()
    await expect(page.getByText('App key', { exact: true })).toBeVisible()
    await expect(page.getByText(seededApp.slug, { exact: true })).toBeVisible()
    const routingIdentity = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Routing identity' }),
    })
    await expect(routingIdentity.getByText('Workspace', { exact: true })).toBeVisible()
    await expect(page.getByText(seededLink.name, { exact: true })).toBeVisible()
    await expect(
      page.getByText(`/l/${seededApp.slug}/${seededLink.slug}`, { exact: false }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Edit configuration' }).click()
    const editDialog = page.getByRole('dialog', { name: 'Edit app configuration' })
    await expect(editDialog.getByText(seededApp.slug, { exact: true })).toBeVisible()
    await expect(editDialog.getByText('Permanent', { exact: true })).toBeVisible()
    await expect(editDialog.getByLabel('App name')).toHaveValue(seededApp.name)
    await editDialog.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('button', { name: 'Pause app' }).click()
    const confirmation = page.getByRole('alertdialog', { name: 'Pause this app?' })
    await expect(confirmation).toContainText(
      'Public links connected to this app will stop resolving',
    )
    await confirmation.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirmation).toBeHidden()
  })
})
