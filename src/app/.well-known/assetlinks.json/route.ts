import { buildAndroidAssociation } from '@/lib/domain/associations'
import { serializeAssociationDocument } from '@/lib/domain/association-document'
import { publicReadHeaders } from '@/lib/domain/public-read-headers'
import { loadAssociationApps } from '@/lib/server/load-association-apps'
import { resolvePublicHost } from '@/lib/server/resolve-public-host'

export const dynamic = 'force-dynamic'

export const GET = async (request: Request): Promise<Response> => {
  const host = await resolvePublicHost(request, 'associations')
  if (!host.ok) {
    return Response.json(
      { error: 'Association document is unavailable for this hostname.' },
      {
        status: host.httpStatus,
        headers: { ...publicReadHeaders, 'Cache-Control': 'no-store' },
      },
    )
  }

  const apps = await loadAssociationApps(host.workspaceID ?? undefined)
  const document = serializeAssociationDocument(buildAndroidAssociation(apps))
  if (!document.ok) {
    return Response.json(
      { error: 'Association document exceeds the configured safe size.' },
      {
        status: 503,
        headers: { ...publicReadHeaders, 'Cache-Control': 'no-store' },
      },
    )
  }

  return new Response(document.body, {
    headers: {
      ...publicReadHeaders,
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
