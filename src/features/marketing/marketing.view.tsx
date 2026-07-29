import Link from 'next/link'

import { BrandMark } from '@/components/ui/brand-mark'
import { Icon } from '@/components/ui/icon'

import { DocsView } from './docs.view'
import { CustomDomainsGuideView } from './custom-domains-guide.view'
import { LandingView } from './landing.view'
import { LegalView } from './legal.view'
import type { MarketingViewProps } from './marketing.types'
import { PricingView } from './pricing.view'
import { ReactNativeGuideView } from './react-native-guide.view'
import { ResourceView } from './resource.view'
import { SelfHostingGuideView } from './self-hosting-guide.view'
import { SponsorView } from './sponsor.view'
import { StatusView } from './status.view'

const navigation = [
  { href: '/#product', label: 'Product' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
  { href: '/open-source', label: 'Open source' },
] as const

export function MarketingView(props: MarketingViewProps) {
  return (
    <div className="marketing-site">
      <header className="marketing-header">
        <div className="marketing-container marketing-nav">
          <Link className="marketing-brand" href="/" onClick={props.onCloseMenu}>
            <BrandMark className="marketing-brand-mark" />
            <span>
              <strong>LinksetGo</strong>
              <small>DEEP LINKS, DONE RIGHT</small>
            </span>
          </Link>
          <button
            aria-expanded={props.isMenuOpen}
            aria-label="Toggle navigation"
            className="marketing-menu-button"
            onClick={props.onToggleMenu}
            type="button"
          >
            <Icon name={props.isMenuOpen ? 'x' : 'menu'} />
          </button>
          <nav
            aria-label="Marketing navigation"
            className={`marketing-links ${props.isMenuOpen ? 'marketing-links-open' : ''}`}
          >
            {navigation.map((item) => (
              <Link href={item.href} key={item.href} onClick={props.onCloseMenu}>
                {item.label}
              </Link>
            ))}
            <Link className="marketing-login" href={props.signInURL} onClick={props.onCloseMenu}>
              Sign in
            </Link>
            <Link
              className="marketing-cta"
              href={props.headerPrimaryAction.href}
              onClick={props.onCloseMenu}
            >
              {props.headerPrimaryAction.label} <Icon name="arrow" size={15} />
            </Link>
          </nav>
        </div>
      </header>

      {props.page === 'home' ? <LandingView primaryAction={props.landingPrimaryAction} /> : null}
      {props.page === 'pricing' ? <PricingView plans={props.pricingPlans} /> : null}
      {props.page === 'docs' ? <DocsView /> : null}
      {props.page === 'custom-domains' ? <CustomDomainsGuideView /> : null}
      {props.page === 'react-native' ? <ReactNativeGuideView /> : null}
      {props.page === 'privacy' || props.page === 'terms' ? <LegalView page={props.page} /> : null}
      {props.page === 'sponsor' ? <SponsorView sponsorURL={props.sponsorURL} /> : null}
      {props.page === 'status' ? <StatusView status={props.serviceStatus} /> : null}
      {props.page === 'self-hosting' ? <SelfHostingGuideView /> : null}
      {props.page === 'open-source' || props.page === 'security' || props.page === 'changelog' ? (
        <ResourceView page={props.page} sourceCodeURL={props.sourceCodeURL} />
      ) : null}

      <footer className="marketing-footer">
        <div className="marketing-container marketing-footer-grid">
          <div>
            <Link className="marketing-brand marketing-brand-footer" href="/">
              <BrandMark className="marketing-brand-mark" />
              <span>
                <strong>LinksetGo</strong>
                <small>DEEP LINKS, DONE RIGHT</small>
              </span>
            </Link>
            <p>Reliable links for every app, campaign and device.</p>
          </div>
          <div className="marketing-footer-links">
            <Link href="/docs">Documentation</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href={props.signInURL}>Console</Link>
            <Link href="/open-source">Open source</Link>
            {props.sourceCodeURL ? (
              <a href={props.sourceCodeURL} rel="noreferrer" target="_blank">
                Source code
              </a>
            ) : null}
            <Link href="/security">Security</Link>
            <Link href="/report-abuse">Report abuse</Link>
            <Link href="/changelog">Changelog</Link>
            <Link href="/sponsor">Sponsor</Link>
            <Link href="/status">Status</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
          <p className="marketing-copyright">LinksetGo Community. Open source, self-hostable.</p>
        </div>
      </footer>
    </div>
  )
}
