import 'server-only'

export type BoundedJSONResult =
  { ok: true; value: unknown } | { message: string; ok: false; status: 400 | 413 | 415 }

export async function readBoundedJSON(
  request: Request,
  maximumBodyBytes: number,
): Promise<BoundedJSONResult> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    return { message: 'Content-Type must be application/json.', ok: false, status: 415 }
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength) {
    const byteLength = Number(declaredLength)
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      return { message: 'Content-Length is invalid.', ok: false, status: 400 }
    }
    if (byteLength > maximumBodyBytes) {
      return { message: 'Request body is too large.', ok: false, status: 413 }
    }
  }
  if (!request.body) return { message: 'A JSON request body is required.', ok: false, status: 400 }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    receivedBytes += chunk.value.byteLength
    if (receivedBytes > maximumBodyBytes) {
      await reader.cancel().catch(() => undefined)
      return { message: 'Request body is too large.', ok: false, status: 413 }
    }
    chunks.push(chunk.value)
  }

  const bytes = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  } catch {
    return { message: 'Request body must contain valid UTF-8 JSON.', ok: false, status: 400 }
  }
}
