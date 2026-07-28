import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { seededApp, seededLink } from '../helpers/relay-fixtures'

const destinations = [
  { heading: 'Apps', label: 'Apps', path: '/admin/apps' },
  { heading: 'Links', label: 'Links', path: '/admin/links' },
  { heading: 'Domains', label: 'Domains', path: '/admin/domains' },
  { heading: 'Test Lab', label: 'Test Lab', path: '/admin/test-lab' },
  { heading: 'Team', label: 'Team', path: '/admin/team' },
  { heading: 'Settings', label: 'Settings', path: '/admin/settings' },
  { heading: /Good (morning|afternoon|evening)/, label: 'Overview', path: '/admin' },
] as const

test.describe('Relay admin console', () => {
  test.beforeEach(async ({ page }) => {
    await login({ page })
  })

  test('shows the seeded workspace on the overview', async ({ page }) => {
    await expect(page).toHaveTitle(/Relay/)
    await expect(page.getByLabel('Active workspace')).not.toHaveValue('')
    await expect(page.getByText(seededLink.name, { exact: true })).toBeVisible()
    await expect(page.getByText(seededApp.name, { exact: true })).toBeVisible()
    await expect(
      page.getByText(`/l/${seededApp.slug}/${seededLink.slug}`, { exact: false }),
    ).toBeVisible()
  })

  test('navigates every primary workspace section', async ({ page }, testInfo) => {
    const navigation = page.getByRole('navigation', { name: 'Primary navigation' })

    for (const destination of destinations) {
      const destinationLink = navigation.getByRole('link', {
        name: destination.label,
        exact: true,
      })
      if (testInfo.project.name === 'mobile-chrome') {
        await page.getByRole('button', { name: 'Open navigation' }).click()
        await expect(destinationLink).toBeInViewport()
      }
      await destinationLink.click()
      await page.waitForURL((url) => url.pathname === destination.path)
      await expect(page.getByRole('heading', { level: 1, name: destination.heading })).toBeVisible()
      await expect(
        navigation.getByRole('link', { name: destination.label, exact: true }),
      ).toHaveAttribute('aria-current', 'page')
    }
  })

  test('opens a create-link form without changing seeded data', async ({ page }) => {
    await page.getByRole('button', { name: 'Create link' }).first().click()
    await page.waitForURL(
      (url) => url.pathname === '/admin/links' && url.searchParams.get('create') === '1',
    )

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Create deep link' })).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: 'App', exact: true })).toHaveValue(/\d+/)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('imports a React Native URL into route and parameter fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Create link' }).first().click()
    const dialog = page.getByRole('dialog')

    await dialog
      .getByLabel(/React Native URL/)
      .fill(`${seededApp.nativeScheme}://rewards-detail?SlabName=Gold&SlabPromo=10OFF`)
    await dialog.getByRole('button', { name: 'Import route' }).click()

    await expect(dialog.getByLabel('Destination path')).toHaveValue('/rewards-detail')
    await expect(dialog.getByLabel('Parameter key').nth(0)).toHaveValue('SlabName')
    await expect(dialog.getByLabel('Parameter value').nth(0)).toHaveValue('Gold')
    await expect(dialog.getByLabel('Parameter key').nth(1)).toHaveValue('SlabPromo')
    await expect(dialog.getByLabel('Parameter value').nth(1)).toHaveValue('10OFF')
    await expect(dialog.getByRole('status')).toContainText('2 query parameters imported')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('validates a saved link on both platforms and downloads its QR code', async ({ page }) => {
    await page.goto('/admin/test-lab')

    await page
      .getByLabel('Saved link')
      .selectOption({ label: `${seededApp.name} / ${seededLink.name}` })
    await expect(page.getByLabel('Public deep-link URL')).toHaveValue(
      new RegExp(`/l/${seededApp.slug}/${seededLink.slug}$`),
    )
    await expect(page.getByRole('button', { name: 'Both', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('img', { name: 'QR code for the current deep link' })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PNG' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`relay-${seededApp.slug}-${seededLink.slug}.png`)

    await page.getByRole('button', { name: 'Run both platforms' }).click()
    await expect(page.getByText('iOS association', { exact: true })).toBeVisible()
    await expect(page.getByText('Android association', { exact: true })).toBeVisible()
    await expect(page.getByText(/real-device test is still required/i)).toBeVisible()
    await expect(page.getByText(/cannot prove that the installed app opened/i)).toBeVisible()
  })
})
