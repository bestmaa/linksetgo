export const MAX_ASSOCIATION_DOCUMENT_BYTES = 128 * 1024

export type SerializedAssociationDocument =
  { body: string; byteLength: number; ok: true } | { byteLength: number; ok: false }

export function serializeAssociationDocument(value: unknown): SerializedAssociationDocument {
  const body = JSON.stringify(value)
  const byteLength = new TextEncoder().encode(body).byteLength
  return byteLength <= MAX_ASSOCIATION_DOCUMENT_BYTES
    ? { body, byteLength, ok: true }
    : { byteLength, ok: false }
}
