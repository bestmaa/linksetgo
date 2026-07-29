import { afterEach, describe, expect, it } from 'vitest'

import { POST as postSignup } from '../../src/app/api/auth/signup/route'
import { POST as postVerification } from '../../src/app/api/auth/verify-email/route'
import { evaluateCloudSignupGate, parseCloudSignupInput } from '../../src/lib/domain/cloud-signup'
import { getCloudSignupConfiguration } from '../../src/lib/server/cloud-signup-config'
import { applyNewUserPolicy } from '../../src/lib/server/user-creation-policy'

const validSignup = {
  acceptTerms: true,
  email: 'owner@example.test',
  name: 'Example Owner',
  organizationName: 'Example App',
  password: 'StrongPassword123!',
  workspaceSlug: 'example-app',
} as const

const originalEdition = process.env.RELAY_EDITION
const originalSignupEnabled = process.env.CLOUD_SIGNUP_ENABLED

afterEach(() => {
  if (originalEdition === undefined) delete process.env.RELAY_EDITION
  else process.env.RELAY_EDITION = originalEdition
  if (originalSignupEnabled === undefined) delete process.env.CLOUD_SIGNUP_ENABLED
  else process.env.CLOUD_SIGNUP_ENABLED = originalSignupEnabled
})

describe('Relay Cloud signup policy', () => {
  it('rejects public signup in Community even when the feature flag is true', () => {
    expect(
      evaluateCloudSignupGate({
        cloudSignupEnabled: 'true',
        linksetGoEdition: 'community',
      }),
    ).toEqual({ ok: false, code: 'COMMUNITY_EDITION' })
    expect(
      getCloudSignupConfiguration({
        CLOUD_SIGNUP_ENABLED: 'true',
        RELAY_EDITION: 'community',
      }),
    ).toEqual({ status: 'unavailable', reason: 'community-edition' })
  })

  it('returns a closed public endpoint for Community and disabled Cloud installs', async () => {
    process.env.RELAY_EDITION = 'community'
    process.env.CLOUD_SIGNUP_ENABLED = 'true'
    const communityResponse = await postSignup(
      new Request('http://localhost/api/auth/signup', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(communityResponse.status).toBe(404)
    const communityVerificationResponse = await postVerification(
      new Request('http://localhost/api/auth/verify-email', {
        body: JSON.stringify({ token: 'A'.repeat(43) }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(communityVerificationResponse.status).toBe(404)

    process.env.RELAY_EDITION = 'cloud'
    process.env.CLOUD_SIGNUP_ENABLED = 'false'
    const disabledResponse = await postSignup(
      new Request('http://localhost/api/auth/signup', {
        body: '{}',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(disabledResponse.status).toBe(404)
  })

  it('fails closed in Cloud until signup is explicitly enabled', () => {
    expect(
      evaluateCloudSignupGate({
        cloudSignupEnabled: undefined,
        linksetGoEdition: 'cloud',
      }),
    ).toEqual({ ok: false, code: 'SIGNUP_DISABLED' })
    expect(
      getCloudSignupConfiguration({
        CLOUD_SIGNUP_ENABLED: 'false',
        RELAY_EDITION: 'cloud',
      }),
    ).toEqual({ status: 'unavailable', reason: 'signup-disabled' })
  })

  it('rejects reserved workspace hosts and browser-supplied authority fields', () => {
    expect(parseCloudSignupInput({ ...validSignup, workspaceSlug: 'admin' })).toMatchObject({
      ok: false,
      field: 'workspaceSlug',
    })
    expect(parseCloudSignupInput({ ...validSignup, workspaceSlug: 'relay' })).toMatchObject({
      ok: false,
      field: 'workspaceSlug',
    })
    expect(parseCloudSignupInput({ ...validSignup, role: 'super-admin' })).toEqual({
      ok: false,
      field: 'form',
      message: 'The signup request contains unknown fields.',
    })
    expect(parseCloudSignupInput({ ...validSignup, domain: 'victim.example' })).toMatchObject({
      ok: false,
      field: 'form',
    })
    expect(parseCloudSignupInput({ ...validSignup, plan: 'pro' })).toMatchObject({
      ok: false,
      field: 'form',
    })
  })

  it('never promotes an internally marked signup during an empty-database race', () => {
    expect(
      applyNewUserPolicy(
        { email: validSignup.email, role: 'super-admin', status: 'active' },
        { existingUsers: 0, isCloudSignup: true },
      ),
    ).toMatchObject({ role: 'viewer', status: 'pending-verification' })

    expect(
      applyNewUserPolicy(
        { email: 'first-owner@linksetgo.test' },
        { existingUsers: 0, isCloudSignup: false },
      ),
    ).toMatchObject({ role: 'super-admin', status: 'active' })
  })

  it('requires complete, explicit production delivery configuration', () => {
    expect(
      getCloudSignupConfiguration({
        CLOUD_APP_BASE_URL: 'https://app.linksetgo.test',
        CLOUD_SIGNUP_ENABLED: 'true',
        CLOUD_VERIFICATION_WEBHOOK_SECRET: 'x'.repeat(32),
        CLOUD_VERIFICATION_WEBHOOK_URL: 'https://mailer.linksetgo.test/verify',
        MANAGED_LINK_ROOT_DOMAIN: 'links.linksetgo.test',
        NODE_ENV: 'production',
        RELAY_EDITION: 'cloud',
      }),
    ).toMatchObject({
      status: 'ready',
      appBaseURL: 'https://app.linksetgo.test',
      managedLinkRootDomain: 'links.linksetgo.test',
    })

    expect(
      getCloudSignupConfiguration({
        CLOUD_APP_BASE_URL: 'https://app.linksetgo.test',
        CLOUD_SIGNUP_ENABLED: 'true',
        CLOUD_VERIFICATION_WEBHOOK_SECRET: 'short',
        CLOUD_VERIFICATION_WEBHOOK_URL: 'https://mailer.linksetgo.test/verify',
        MANAGED_LINK_ROOT_DOMAIN: 'links.linksetgo.test',
        NODE_ENV: 'production',
        RELAY_EDITION: 'cloud',
      }),
    ).toMatchObject({ status: 'misconfigured' })

    expect(
      getCloudSignupConfiguration({
        CLOUD_APP_BASE_URL: 'https://app.linksetgo.test/untrusted-path',
        CLOUD_SIGNUP_ENABLED: 'true',
        CLOUD_VERIFICATION_WEBHOOK_SECRET: 'x'.repeat(32),
        CLOUD_VERIFICATION_WEBHOOK_URL: 'https://mailer.linksetgo.test/verify',
        MANAGED_LINK_ROOT_DOMAIN: 'links.linksetgo.test',
        NODE_ENV: 'production',
        RELAY_EDITION: 'cloud',
      }),
    ).toMatchObject({ status: 'misconfigured' })
  })
})
