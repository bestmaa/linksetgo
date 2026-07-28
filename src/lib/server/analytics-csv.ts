import type { AnalyticsSummaryDTO } from '@/lib/client/payload-types'

const formulaPrefix = /^[=+\-@\t\r]/

export function safeCSVCell(value: string | number): string {
  const text = String(value)
  const protectedText = formulaPrefix.test(text) ? `'${text}` : text
  return `"${protectedText.replaceAll('"', '""')}"`
}

export function analyticsSummaryCSV(summary: AnalyticsSummaryDTO): string {
  const rows: (number | string)[][] = [
    ['dimension', 'id', 'label', 'count', 'from', 'to'],
    ['total', 'all', 'All events', summary.totalEvents, summary.range.from, summary.range.to],
    ...summary.daily.map((row) => ['date', row.date, row.date, row.count, '', '']),
    ...summary.apps.map((row) => ['app', row.id, row.label, row.count, '', '']),
    ...summary.links.map((row) => ['link', row.id, row.label, row.count, '', '']),
    ...summary.platforms.map((row) => ['platform', row.id, row.label, row.count, '', '']),
    ...summary.events.map((row) => ['event', row.id, row.label, row.count, '', '']),
    ...summary.hosts.map((row) => ['host', row.id, row.label, row.count, '', '']),
  ]
  return `${rows.map((row) => row.map(safeCSVCell).join(',')).join('\r\n')}\r\n`
}
