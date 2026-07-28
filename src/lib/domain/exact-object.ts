export function isExactObject(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  return (
    hasOnlyObjectKeys(value, expectedKeys) &&
    Object.keys(value).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  )
}

export function hasOnlyObjectKeys(
  value: unknown,
  allowedKeys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.keys(value).every((key) => allowedKeys.includes(key))
}
