import { includesAndroid, includesIOS } from './app-onboarding.helpers'
import type {
  AppOnboardingErrors,
  AppOnboardingField,
  AppOnboardingForm,
} from './app-onboarding.types'
import { OnboardingTextField } from './onboarding-field.view'

type DestinationsStepProps = {
  errors: AppOnboardingErrors
  form: AppOnboardingForm
  onFieldBlur: (field: AppOnboardingField) => void
  onFieldChange: (field: AppOnboardingField, value: string) => void
}

export function DestinationsStepView(props: DestinationsStepProps) {
  return (
    <section aria-labelledby="app-onboarding-step-title" className="onboarding-step">
      <div className="onboarding-step-heading">
        <p className="eyebrow">Safe fallback</p>
        <h1 id="app-onboarding-step-title" tabIndex={-1}>
          Decide where every visitor can continue
        </h1>
        <p>
          Store listings help people install the app. The default web fallback is the guaranteed
          destination when the app cannot open, so it must use HTTPS.
        </p>
      </div>

      <div className="onboarding-form-grid">
        {includesIOS(props.form.platform) ? (
          <OnboardingTextField
            error={props.errors.appStoreUrl}
            help="Optional. Paste the public apps.apple.com listing; do not use an App Store Connect URL."
            id="app-store-url"
            label="Apple App Store URL"
            onBlur={() => props.onFieldBlur('appStoreUrl')}
            onChange={(value) => props.onFieldChange('appStoreUrl', value)}
            placeholder="https://apps.apple.com/in/app/…"
            type="url"
            value={props.form.appStoreUrl}
          />
        ) : null}
        {includesAndroid(props.form.platform) ? (
          <OnboardingTextField
            error={props.errors.playStoreUrl}
            help="Optional. Use the public play.google.com/store/apps/details listing."
            id="play-store-url"
            label="Google Play URL"
            onBlur={() => props.onFieldBlur('playStoreUrl')}
            onChange={(value) => props.onFieldChange('playStoreUrl', value)}
            placeholder="https://play.google.com/store/apps/details?id=…"
            type="url"
            value={props.form.playStoreUrl}
          />
        ) : null}
        <div className="onboarding-form-span">
          <OnboardingTextField
            error={props.errors.fallbackUrl}
            help="LinksetGo automatically allowlists this hostname for the app. Per-link fallbacks must stay on an approved hostname."
            id="fallback-url"
            label="Default web fallback"
            onBlur={() => props.onFieldBlur('fallbackUrl')}
            onChange={(value) => props.onFieldChange('fallbackUrl', value)}
            placeholder="https://www.example.com/download"
            required
            type="url"
            value={props.form.fallbackUrl}
          />
        </div>
      </div>

      <aside className="onboarding-safety-card">
        <span aria-hidden="true">↗</span>
        <div>
          <strong>No open redirects</strong>
          <p>
            LinksetGo records the fallback hostname on this app. A future link cannot silently send
            visitors to an unrelated domain.
          </p>
        </div>
      </aside>
    </section>
  )
}
