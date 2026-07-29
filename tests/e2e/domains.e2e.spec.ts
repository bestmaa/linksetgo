import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

type MockDomain = {
  hostname: string
  id: number
  status:
    | 'active'
    | 'association-incomplete'
    | 'certificate-ready'
    | 'pending-dns'
    | 'suspended'
    | 'verifying'
  type: 'custom' | 'managed'
}

test.describe('workspace domain console', () => {
  test.beforeEach(async ({ page }) => {
    await login({ page })
  })

  test('shows exact DNS instructions and submits only custom-domain intent', async ({ page }) => {
    const domains: MockDomain[] = [
      { hostname: 'links.company.com', id: 11, status: 'pending-dns', type: 'custom' },
      { hostname: 'workspace.links.linksetgo.example', id: 12, status: 'active', type: 'managed' },
    ]
    let submittedBody: Record<string, unknown> | null = null

    await page.route('**/api/admin/domains**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const instructionMatch = /^\/api\/admin\/domains\/(\d+)\/instructions$/.exec(url.pathname)
      if (instructionMatch) {
        const domain = domains.find((item) => String(item.id) === instructionMatch[1])
        await route.fulfill({
          body: JSON.stringify({
            domain,
            records: {
              cname: {
                name: domain?.hostname,
                target: 'ingress.linksetgo.example',
                type: 'CNAME',
              },
              ownership: {
                name: `_linksetgo-verification.${domain?.hostname}`,
                type: 'TXT',
                value: 'linksetgo-domain-verification=server-generated-token-value',
              },
            },
          }),
          contentType: 'application/json',
          status: 200,
        })
        return
      }

      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>
        submittedBody = body
        const created: MockDomain = {
          hostname: String(body.hostname),
          id: 13,
          status: 'pending-dns',
          type: 'custom',
        }
        domains.push(created)
        await route.fulfill({
          body: JSON.stringify(created),
          contentType: 'application/json',
          status: 200,
        })
        return
      }

      await route.fulfill({
        body: JSON.stringify({ docs: domains }),
        contentType: 'application/json',
        status: 200,
      })
    })

    await page.goto('/admin/domains')
    await expect(page.getByRole('heading', { level: 1, name: 'Domains' })).toBeVisible()
    const domainList = page.getByRole('region', { name: 'Workspace domains' })
    await expect(
      domainList.getByRole('button', { name: /links\.company\.com.*pending-dns/i }),
    ).toBeVisible()
    await expect(
      domainList.getByRole('button', {
        name: /workspace\.links\.relay\.example.*active/i,
      }),
    ).toBeVisible()
    await expect(page.getByText('ingress.linksetgo.example', { exact: true })).toBeVisible()
    await expect(
      page.getByText('linksetgo-domain-verification=server-generated-token-value', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/Do not ship this hostname/)).toBeVisible()

    await page.getByRole('button', { name: 'Add custom domain' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(/Public hostname/).fill('https://invalid.company.com/path')
    await dialog.getByRole('button', { name: 'Register domain' }).click()
    await expect(dialog.getByText(/without a scheme, path, port, IP, or wildcard/)).toBeVisible()

    await dialog.getByLabel(/Public hostname/).fill('go.company.com')
    await dialog.getByRole('button', { name: 'Register domain' }).click()
    await expect(page.getByRole('heading', { name: 'go.company.com' })).toBeVisible()
    expect(submittedBody).toEqual({
      hostname: 'go.company.com',
      workspaceId: expect.any(String),
    })
    expect(submittedBody).not.toHaveProperty('status')
    expect(submittedBody).not.toHaveProperty('type')
    expect(submittedBody).not.toHaveProperty('verificationToken')
  })
})
