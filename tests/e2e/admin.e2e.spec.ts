import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { seededApp, seededLink } from '../helpers/sample-fixtures'

const destinations = [
  { heading: 'Apps', label: 'Apps', path: '/admin/apps' },
  { heading: 'Links', label: 'Links', path: '/admin/links' },
  { heading: 'Domains', label: 'Domains', path: '/admin/domains' },
  { heading: 'Test Lab', label: 'Test Lab', path: '/admin/test-lab' },
  { heading: 'Team', label: 'Team', path: '/admin/team' },
  { heading: 'Settings', label: 'Settings', path: '/admin/settings' },
  { heading: /Good (morning|afternoon|evening)/, label: 'Overview', path: '/admin' },
] as const

test.describe('LinksetGo admin console', () => {
  test.beforeEach(async ({ page }) => {
    await login({ page })
  })

  test('shows the seeded workspace on the overview', async ({ page }) => {
    await expect(page).toHaveTitle(/LinksetGo/)
    await expect(page.getByLabel('Active workspace')).not.toHaveValue('')
    await expect(page.getByText(seededLink.name, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(seededApp.name, { exact: true }).first()).toBeVisible()
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

  test('opens the quick-link panel without changing seeded data', async ({ page }) => {
    await page.getByRole('button', { name: 'Create link' }).first().click()
    await page.waitForURL(
      (url) => url.pathname === '/admin/links' && url.hash === '#quick-link-title',
    )

    const quickLinkPanel = page.getByRole('region', { name: 'Paste your mobile URL' })
    await expect(page.getByText(seededLink.name, { exact: true }).first()).toBeVisible()
    const initialLinkCount = await page.getByText(/\d+ links$/, { exact: true }).innerText()

    await expect(quickLinkPanel).toBeVisible()
    await expect(quickLinkPanel.getByLabel('Mobile deep link')).toHaveValue('')
    await expect(quickLinkPanel.getByRole('button', { name: 'Create link' })).toBeDisabled()
    await expect(page.getByText(seededLink.name, { exact: true }).first()).toBeVisible()

    await page.reload()

    await expect(page.getByText(/\d+ links$/, { exact: true })).toHaveText(initialLinkCount)
    await expect(page.getByText(seededLink.name, { exact: true }).first()).toBeVisible()
  })

  test('accepts a complete native URL and exposes optional settings without autosaving', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Create link' }).first().click()
    const quickLinkPanel = page.getByRole('region', { name: 'Paste your mobile URL' })
    await expect(page.getByText(seededLink.name, { exact: true }).first()).toBeVisible()
    const linkCount = page.getByText(/\d+ links$/, { exact: true })
    await expect(linkCount).toHaveText(/^[1-9]\d* links$/)
    const initialLinkCount = await linkCount.innerText()
    const nativeUrl = `${seededApp.nativeScheme}://rewards-detail?SlabName=Gold&SlabPromo=10OFF`

    await quickLinkPanel.getByLabel('Mobile deep link').fill(nativeUrl)
    await expect(quickLinkPanel.getByLabel('Mobile deep link')).toHaveValue(nativeUrl)
    await expect(quickLinkPanel.getByRole('button', { name: 'Create link' })).toBeEnabled()

    await quickLinkPanel.getByRole('button', { name: 'Optional fallback and store links' }).click()
    await quickLinkPanel.getByLabel(/^Link name/).fill('Rewards detail')
    await quickLinkPanel.getByLabel(/^Web fallback/).fill('https://example.com/rewards')
    await quickLinkPanel
      .getByLabel(/^Google Play URL/)
      .fill('https://play.google.com/store/apps/details?id=com.example.sampleapp')
    await quickLinkPanel
      .getByLabel(/^App Store URL/)
      .fill('https://apps.apple.com/app/sample-app/id123456789')

    await expect(quickLinkPanel.getByLabel(/^Link name/)).toHaveValue('Rewards detail')
    await expect(quickLinkPanel.getByLabel(/^Web fallback/)).toHaveValue(
      'https://example.com/rewards',
    )

    await page.reload()

    await expect(linkCount).toHaveText(initialLinkCount)
    await expect(page.getByText(seededLink.name, { exact: true }).first()).toBeVisible()
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
    expect(download.suggestedFilename()).toBe(`linksetgo-${seededApp.slug}-${seededLink.slug}.png`)

    await page.getByRole('button', { name: 'Run both platforms' }).click()
    await expect(page.getByText('iOS association', { exact: true })).toBeVisible()
    await expect(page.getByText('Android association', { exact: true })).toBeVisible()
    await expect(page.getByText(/real-device test is still required/i)).toBeVisible()
    await expect(page.getByText(/cannot prove that the installed app opened/i)).toBeVisible()
  })
})
