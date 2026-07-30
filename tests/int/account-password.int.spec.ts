import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_PASSWORD_MIN_LENGTH,
  isStrongAccountPassword,
} from '@/lib/domain/account-password'

describe('account password policy', () => {
  it('accepts passwords that satisfy every required character class and length boundary', () => {
    expect(isStrongAccountPassword('StrongPassword123!')).toBe(true)
    expect(isStrongAccountPassword(`A1!${'a'.repeat(ACCOUNT_PASSWORD_MIN_LENGTH - 3)}`)).toBe(true)
    expect(isStrongAccountPassword(`A1!${'a'.repeat(ACCOUNT_PASSWORD_MAX_LENGTH - 3)}`)).toBe(true)
  })

  it.each([
    ['too short', 'Short1!'],
    ['too long', `A1!${'a'.repeat(ACCOUNT_PASSWORD_MAX_LENGTH - 2)}`],
    ['no uppercase', 'alllowercase123!'],
    ['no lowercase', 'ALLUPPERCASE123!'],
    ['no number', 'NoNumberPassword!'],
    ['no symbol', 'NoSymbolPassword123'],
    ['control character', 'StrongPassword1!\n'],
  ])('rejects %s', (_case, password) => {
    expect(isStrongAccountPassword(password)).toBe(false)
  })
})
