import { expect, test } from '@playwright/test'

import { seededApp, seededLink } from '../helpers/relay-fixtures'

test.describe('LinksetGo public surface', () => {
  test('renders the seeded deep-link fallback', async ({ page }) => {
    await page.goto(`/l/${seededApp.slug}/${seededLink.slug}`)

    await expect(
      page.getByRole('heading', { level: 1, name: `Continue to ${seededApp.name}` }),
    ).toBeVisible()
    await expect(page.getByText(`Destination: ${seededLink.destinationPath}`)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Continue on the web' })).toHaveAttribute(
      'href',
      'https://example.com/',
    )
  })

  test('renders a safe unavailable state for an unknown link', async ({ page }) => {
    await page.goto(`/l/${seededApp.slug}/not-a-real-link`)

    await expect(
      page.getByRole('heading', { level: 1, name: 'This link is unavailable' }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /App Store|Google Play|Continue on the web/ }),
    ).toHaveCount(0)
  })

  test('publishes association records for the seeded app', async ({ request }) => {
    const appleResponse = await request.get('/.well-known/apple-app-site-association')
    expect(appleResponse.ok()).toBe(true)
    expect(appleResponse.headers()['content-type']).toContain('application/json')
    await expect(appleResponse.json()).resolves.toMatchObject({
      applinks: {
        details: expect.arrayContaining([
          expect.objectContaining({
            appID: seededApp.appleAppID,
            components: expect.arrayContaining([
              expect.objectContaining({ '/': seededApp.pathPattern }),
            ]),
          }),
        ]),
      },
    })

    const androidResponse = await request.get('/.well-known/assetlinks.json')
    expect(androidResponse.ok()).toBe(true)
    await expect(androidResponse.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            namespace: 'android_app',
            package_name: seededApp.androidPackageName,
          }),
        }),
      ]),
    )
  })
})
