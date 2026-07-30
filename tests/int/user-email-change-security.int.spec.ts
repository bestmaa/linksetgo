import { REST_PATCH } from '@payloadcms/next/routes'
import { TextEncoder as NodeTextEncoder } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'
import type { User } from '@/payload-types'

const FIXTURE = {
  memberEmail: 'email-change-member@linksetgo.test',
  memberNewEmail: 'email-change-member-new@linksetgo.test',
  memberPassword: 'EmailChangeMemberPassword123!',
  memberUpdatedPassword: 'EmailChangeMemberUpdatedPassword123!',
  superAdminEmail: 'email-change-super-admin@linksetgo.test',
  superAdminPassword: 'EmailChangeSuperAdminPassword123!',
  weakPasswordEmail: 'email-change-weak-password@linksetgo.test',
} as const

const assertTestDatabase = (): void => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for integration tests.')

  const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1))
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run integration cleanup against "${databaseName}".`)
  }
}

describe.sequential('generic user update security', () => {
  const browserEncoder = globalThis.TextEncoder
  const browserBytes = globalThis.Uint8Array
  let member: User
  let payload: Payload | undefined

  const cleanup = async (): Promise<void> => {
    if (!payload) return

    await payload.delete({
      collection: 'users',
      overrideAccess: true,
      where: {
        email: {
          in: [
            FIXTURE.memberEmail,
            FIXTURE.memberNewEmail,
            FIXTURE.superAdminEmail,
            FIXTURE.weakPasswordEmail,
          ],
        },
      },
    })
  }

  const authenticatedPatch = async (
    token: string,
    userID: number | string,
    data: Record<string, unknown>,
  ): Promise<Response> => {
    const patch = REST_PATCH(config)
    return patch(
      new Request(`http://127.0.0.1:3100/api/users/${userID}`, {
        body: JSON.stringify(data),
        headers: {
          authorization: `JWT ${token}`,
          'content-type': 'application/json',
        },
        method: 'PATCH',
      }),
      { params: Promise.resolve({ slug: ['users', String(userID)] }) },
    )
  }

  beforeAll(async () => {
    assertTestDatabase()
    payload = await getPayload({ config: await config })
    await cleanup()

    await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.superAdminEmail,
        name: 'Email change super admin',
        password: FIXTURE.superAdminPassword,
        role: 'super-admin',
        status: 'active',
      },
      overrideAccess: true,
    })
    member = await payload.create({
      collection: 'users',
      data: {
        email: FIXTURE.memberEmail,
        name: 'Email change member',
        password: FIXTURE.memberPassword,
        role: 'admin',
        status: 'active',
      },
      overrideAccess: true,
    })

    const nodeBytes = new NodeTextEncoder().encode('').constructor
    globalThis.TextEncoder = NodeTextEncoder as typeof TextEncoder
    globalThis.Uint8Array = nodeBytes as typeof Uint8Array
  })

  afterAll(async () => {
    if (!payload) return
    try {
      await cleanup()
    } finally {
      try {
        await payload.destroy()
      } finally {
        globalThis.TextEncoder = browserEncoder
        globalThis.Uint8Array = browserBytes
      }
    }
  })

  it('allows a self name update but rejects email and password changes from generic PATCH', async () => {
    const login = await payload!.login({
      collection: 'users',
      data: { email: FIXTURE.memberEmail, password: FIXTURE.memberPassword },
    })
    if (!login.token) throw new Error('The member fixture could not authenticate.')

    const nameResponse = await authenticatedPatch(login.token, member.id, {
      name: 'Updated member name',
    })
    expect(nameResponse.status).toBe(200)

    const emailResponse = await authenticatedPatch(login.token, member.id, {
      email: FIXTURE.memberNewEmail,
    })
    expect(emailResponse.status).toBe(403)

    const unchanged = await payload!.findByID({
      collection: 'users',
      id: member.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(unchanged).toMatchObject({
      email: FIXTURE.memberEmail,
      name: 'Updated member name',
    })

    const passwordResponse = await authenticatedPatch(login.token, member.id, {
      password: FIXTURE.memberUpdatedPassword,
    })
    expect(passwordResponse.status).toBe(403)
    await expect(
      payload!.login({
        collection: 'users',
        data: {
          email: FIXTURE.memberEmail,
          password: FIXTURE.memberPassword,
        },
      }),
    ).resolves.toMatchObject({ user: { id: member.id } })
  })

  it('enforces the strong password policy on direct creation and reset operations', async () => {
    await expect(
      payload!.create({
        collection: 'users',
        data: {
          email: FIXTURE.weakPasswordEmail,
          name: 'Weak password fixture',
          password: 'alllowercase123!',
          role: 'viewer',
          status: 'active',
        },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 400 })

    const token = await payload!.forgotPassword({
      collection: 'users',
      data: { email: FIXTURE.memberEmail },
      disableEmail: true,
      overrideAccess: true,
    })
    if (!token) throw new Error('The reset fixture could not create a token.')

    await expect(
      payload!.resetPassword({
        collection: 'users',
        data: { password: 'alllowercase123!', token },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('allows an active super-admin to manage another user email and password', async () => {
    const login = await payload!.login({
      collection: 'users',
      data: {
        email: FIXTURE.superAdminEmail,
        password: FIXTURE.superAdminPassword,
      },
    })
    if (!login.token) throw new Error('The super-admin fixture could not authenticate.')

    const weakPasswordResponse = await authenticatedPatch(login.token, member.id, {
      password: 'alllowercase123!',
    })
    expect(weakPasswordResponse.status).toBe(400)

    const response = await authenticatedPatch(login.token, member.id, {
      email: FIXTURE.memberNewEmail,
      password: FIXTURE.memberUpdatedPassword,
    })
    expect(response.status).toBe(200)

    await expect(
      payload!.findByID({
        collection: 'users',
        id: member.id,
        depth: 0,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ email: FIXTURE.memberNewEmail })
    await expect(
      payload!.login({
        collection: 'users',
        data: {
          email: FIXTURE.memberNewEmail,
          password: FIXTURE.memberUpdatedPassword,
        },
      }),
    ).resolves.toMatchObject({ user: { id: member.id } })
  })
})
