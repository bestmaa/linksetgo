import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { getSeedAdminCredentials, type SeedAdminCredentials } from './relay-fixtures'

export interface LoginOptions {
  page: Page
  credentials?: SeedAdminCredentials
}

export async function login({
  page,
  credentials = getSeedAdminCredentials(),
}: LoginOptions): Promise<void> {
  await page.goto('/admin/login')

  await page.getByLabel('Work email').fill(credentials.email)
  await page.getByLabel('Password').fill(credentials.password)
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/admin'),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])

  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
}
