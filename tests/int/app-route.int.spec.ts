import { describe, expect, it } from 'vitest'

import { appDestinationPathError, isSafeAppDestinationPath } from '@/lib/domain/app-route'

describe('app destination path contract', () => {
  it.each(['/offers/x', '/rewards-detail', '/brands/details'])(
    'accepts a normal app route: %s',
    (route) => {
      expect(isSafeAppDestinationPath(route)).toBe(true)
    },
  )

  it.each([
    '//offers',
    '/offers//x',
    '/offers\\x',
    '/offers x',
    '/offers?x=1',
    '/offers#x',
    '/offers/%2e%2e/admin',
    '/offers/%2Fadmin',
    '/offers/%ZZ',
  ])('rejects an unsafe route: %s', (route) => {
    expect(appDestinationPathError(route)).toEqual(expect.any(String))
  })
})
