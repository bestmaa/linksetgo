import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'

import type { LinkRowViewModel } from './links.types'

export function LinksTableView({ links }: { links: readonly LinkRowViewModel[] }) {
  return (
    <div className="table-card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Link</th>
            <th>App</th>
            <th>Destination</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id}>
              <td>
                <Link className="name-cell" href={link.detailsHref}>
                  {link.name}
                </Link>
                <div className="link-url truncate">{link.publicUrl}</div>
              </td>
              <td>{link.appName}</td>
              <td className="muted-cell">{link.destination}</td>
              <td>
                <Badge tone={link.statusTone}>{link.status}</Badge>
              </td>
              <td>
                <div className="table-actions">
                  <button
                    aria-label={`Copy ${link.name}`}
                    className="icon-button"
                    onClick={link.onCopy}
                    title="Copy URL"
                    type="button"
                  >
                    <Icon name="copy" size={15} />
                  </button>
                  <Link
                    aria-label={`Test ${link.name}`}
                    className="icon-button"
                    href={link.testHref}
                    title="Open in Test Lab"
                  >
                    <Icon name="test" size={15} />
                  </Link>
                  <Link
                    aria-label={`Manage ${link.name}`}
                    className="icon-button"
                    href={link.detailsHref}
                    title="Manage link"
                  >
                    <Icon name="arrow" size={15} />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
