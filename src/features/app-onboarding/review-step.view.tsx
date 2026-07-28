import { includesAndroid, includesIOS } from './app-onboarding.helpers'
import type { AppOnboardingForm } from './app-onboarding.types'

type ReviewStepProps = {
  form: AppOnboardingForm
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || 'Not provided'}</dd>
    </div>
  )
}

function fingerprintLabel(value: string): string {
  const count = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean).length
  return `${count} signing ${count === 1 ? 'certificate' : 'certificates'}`
}

export function ReviewStepView(props: ReviewStepProps) {
  return (
    <section aria-labelledby="app-onboarding-step-title" className="onboarding-step">
      <div className="onboarding-step-heading">
        <p className="eyebrow">Review</p>
        <h1 id="app-onboarding-step-title" tabIndex={-1}>
          Create a safe draft
        </h1>
        <p>
          Confirm the public identifiers before Relay saves this app. It will stay offline as a
          draft until you intentionally activate it.
        </p>
      </div>

      <section aria-labelledby="review-app-title" className="onboarding-review-card">
        <div className="onboarding-review-heading">
          <span className="app-avatar">{props.form.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <h2 id="review-app-title">{props.form.name}</h2>
            <code>{props.form.slug}</code>
          </div>
          <span className="badge badge-neutral">Draft</span>
        </div>
        {props.form.description ? <p>{props.form.description}</p> : null}
        <dl className="onboarding-review-list">
          <ReviewRow
            label="Platforms"
            value={
              props.form.platform === 'both'
                ? 'iOS and Android'
                : props.form.platform === 'ios'
                  ? 'iOS'
                  : 'Android'
            }
          />
          <ReviewRow label="Native URL scheme" value={`${props.form.nativeScheme}://`} />
          {includesIOS(props.form.platform) ? (
            <>
              <ReviewRow
                label="Apple appID"
                value={`${props.form.iosTeamId}.${props.form.iosBundleId}`}
              />
              <ReviewRow label="App Store" value={props.form.appStoreUrl || 'Add after launch'} />
            </>
          ) : null}
          {includesAndroid(props.form.platform) ? (
            <>
              <ReviewRow label="Android package" value={props.form.androidPackageName} />
              <ReviewRow
                label="Certificates"
                value={fingerprintLabel(props.form.androidSha256CertFingerprints)}
              />
              <ReviewRow
                label="Google Play"
                value={props.form.playStoreUrl || 'Add after launch'}
              />
            </>
          ) : null}
          <ReviewRow label="Default web fallback" value={props.form.fallbackUrl} />
        </dl>
      </section>

      <aside className="onboarding-activation-note">
        <strong>Draft first, public only when you decide</strong>
        <ol>
          <li>Relay saves the app as Draft, so no new public link can resolve yet.</li>
          <li>Review the generated association records, then activate the app.</li>
          <li>Run Test Lab on iOS and Android before sharing the first link.</li>
        </ol>
      </aside>
    </section>
  )
}
