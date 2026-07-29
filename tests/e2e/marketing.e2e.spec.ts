import { expect, test } from '@playwright/test'

const applicationBaseURL = process.env.CLOUD_APP_BASE_URL?.trim() || 'http://localhost:3100'

test.describe('LinksetGo marketing surface', () => {
  test('presents the open-source product before sign in', async ({ page }) => {
    await page.goto('/')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Every mobile link, under your control.',
      }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the console' })).toHaveAttribute(
      'href',
      new URL('/admin/login', applicationBaseURL).toString(),
    )
    await expect(page).toHaveTitle('LinksetGo — Deep links, done right')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/og-linksetgo\.png$/,
    )
  })

  test('publishes transparent Community and Cloud pricing', async ({ page }) => {
    await page.goto('/pricing')

    await expect(page.getByRole('heading', { level: 2, name: 'Community' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Cloud Free' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Starter' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Pro' })).toBeVisible()
    await expect(page.getByText('$5', { exact: true })).toBeVisible()
    await expect(page.getByText('$10', { exact: true })).toBeVisible()
  })

  test('documents the open-source and security boundaries', async ({ page }) => {
    await page.goto('/open-source')
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Run the same deep-link foundation on infrastructure you control.',
      }),
    ).toBeVisible()

    await page.goto('/security')
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Small public responses, explicit trust boundaries.',
      }),
    ).toBeVisible()
  })

  test('explains how a React Native custom URL becomes a LinksetGo route', async ({ page }) => {
    await page.goto('/docs/react-native')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Turn the routes your mobile team already has into durable HTTPS links.',
      }),
    ).toBeVisible()
    await expect(
      page.getByText('oberoi://rewards-detail?SlabName=Gold&SlabPromo=10OFF'),
    ).toBeVisible()
    await expect(page.getByText('/rewards-detail', { exact: true })).toBeVisible()
  })

  test('keeps sponsorship optional when no trusted URL is configured', async ({ page }) => {
    await page.goto('/sponsor')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Help keep open deep-link infrastructure maintained.',
      }),
    ).toBeVisible()
    await expect(
      page.getByText('Sponsorship is not configured for this installation yet.'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sponsor LinksetGo' })).toHaveCount(0)
  })

  test('reports current process and database readiness without uptime claims', async ({ page }) => {
    await page.goto('/status')

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'LinksetGo health without invented uptime claims.',
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'All systems operational' }),
    ).toBeVisible()
    await expect(page.getByText(/99\.9|uptime for/i)).toHaveCount(0)
  })
})
