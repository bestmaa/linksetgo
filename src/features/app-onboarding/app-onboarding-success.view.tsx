import { Button } from '@/components/ui/button'

import type { CreatedAppViewModel } from './app-onboarding.types'

type AppOnboardingSuccessProps = {
  app: CreatedAppViewModel
  onBackToApps: () => void
  onCreateLink: () => void
  onOpenDraft: () => void
}

export function AppOnboardingSuccessView(props: AppOnboardingSuccessProps) {
  return (
    <main className="page onboarding-page">
      <section className="onboarding-success">
        <span aria-hidden="true" className="onboarding-success-mark">
          ✓
        </span>
        <p className="eyebrow">Draft created</p>
        <h1 id="app-onboarding-step-title" tabIndex={-1}>
          {props.app.name} is safely offline
        </h1>
        <p>
          LinksetGo saved <code>{props.app.slug}</code> for {props.app.platformLabel}. Public links
          remain unavailable while the app is Draft.
        </p>

        <div className="onboarding-next-steps">
          <h2>Bring it online with confidence</h2>
          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Review and activate the draft</strong>
                <p>
                  Activation publishes this app in LinksetGo’s Apple and Android association
                  records.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Create the first deep link</strong>
                <p>Use one of the exact route paths supplied by the mobile team.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Verify before sharing</strong>
                <p>Run both-platform checks in Test Lab, then complete a real-device tap test.</p>
              </div>
            </li>
          </ol>
        </div>

        <div className="onboarding-success-actions">
          <Button onClick={props.onOpenDraft}>Review draft settings</Button>
          <Button onClick={props.onCreateLink} variant="secondary">
            Create first link
          </Button>
          <Button onClick={props.onBackToApps} variant="quiet">
            Back to apps
          </Button>
        </div>
        <p className="onboarding-success-footnote">
          Review, edit and activate the draft in the workspace console. Activation never happens
          automatically.
        </p>
      </section>
    </main>
  )
}
