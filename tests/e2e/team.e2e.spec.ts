import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

test.describe('Relay team management', () => {
  test.beforeEach(async ({ page }) => {
    await login({ page })
  })

  test('opens invitation and owner-safe member controls', async ({ page }) => {
    await page.goto('/admin/team')

    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Organization members' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Invitations' })).toBeVisible()

    await page.getByRole('button', { name: 'Invite member' }).click()
    const invitation = page.getByRole('dialog', { name: 'Invite a team member' })
    await expect(invitation.getByLabel('Work email *')).toBeFocused()
    await expect(invitation.getByLabel('Organization role *')).toHaveValue('member')
    await expect(invitation.getByText(/expire after seven days/i)).toBeVisible()
    await invitation.getByRole('button', { name: 'Cancel' }).click()

    await page
      .getByRole('button', { name: /^Edit / })
      .first()
      .click()
    const member = page.getByRole('dialog', { name: /^Manage / })
    await expect(member.getByText(/blocks changes that would remove your own/i)).toBeVisible()
    await member.getByRole('button', { name: 'Remove member' }).click()
    await expect(member.getByText(/never remove the last active owner/i)).toBeVisible()
    await member.getByRole('button', { name: 'Keep member' }).click()
    await member.getByRole('button', { name: 'Cancel' }).click()
  })

  test('routes Settings team management to the Relay console', async ({ page }) => {
    await page.goto('/admin/settings')
    await page.getByRole('button', { name: 'Team & access' }).click()

    await expect(page.getByText(/Invite teammates, assign organization roles/i)).toBeVisible()
    await page.getByRole('button', { name: 'Manage team access' }).click()
    await expect(page).toHaveURL(/\/admin\/team$/)
  })
})

test('removes an invalid invitation token from browser history', async ({ page }) => {
  await page.goto('/invite#token=invalid')

  await expect(page).toHaveURL(/\/invite$/)
  await expect(page.getByRole('heading', { name: 'Invitation unavailable' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: /invalid or incomplete/i })).toBeVisible()
})
