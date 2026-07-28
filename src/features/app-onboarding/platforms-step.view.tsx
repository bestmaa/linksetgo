import { includesAndroid, includesIOS } from './app-onboarding.helpers'
import type {
  AppOnboardingErrors,
  AppOnboardingField,
  AppOnboardingForm,
  AppPlatform,
} from './app-onboarding.types'
import { OnboardingTextArea, OnboardingTextField } from './onboarding-field.view'

type PlatformsStepProps = {
  errors: AppOnboardingErrors
  form: AppOnboardingForm
  onFieldBlur: (field: AppOnboardingField) => void
  onFieldChange: (field: AppOnboardingField, value: string) => void
  onPlatformChange: (platform: AppPlatform) => void
}

const platformChoices: readonly {
  description: string
  label: string
  value: AppPlatform
}[] = [
  { description: 'Apple Universal Links', label: 'iOS', value: 'ios' },
  { description: 'Android App Links', label: 'Android', value: 'android' },
  { description: 'Configure both association files', label: 'Both', value: 'both' },
]

export function PlatformsStepView(props: PlatformsStepProps) {
  return (
    <section aria-labelledby="app-onboarding-step-title" className="onboarding-step">
      <div className="onboarding-step-heading">
        <p className="eyebrow">Platform trust</p>
        <h1 id="app-onboarding-step-title" tabIndex={-1}>
          Connect the app identities
        </h1>
        <p>
          These public identifiers let Apple and Android prove that your HTTPS links belong to the
          installed app. Relay never needs your signing keys.
        </p>
      </div>

      <fieldset className="onboarding-platform-choice">
        <legend>Which platforms does this app support?</legend>
        <div>
          {platformChoices.map((choice) => (
            <label
              className={props.form.platform === choice.value ? 'platform-choice-selected' : ''}
              key={choice.value}
            >
              <input
                checked={props.form.platform === choice.value}
                name="platform"
                onChange={() => props.onPlatformChange(choice.value)}
                type="radio"
                value={choice.value}
              />
              <strong>{choice.label}</strong>
              <span>{choice.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {includesIOS(props.form.platform) ? (
        <section aria-labelledby="ios-identity-title" className="onboarding-platform-panel">
          <div className="onboarding-platform-title">
            <span aria-hidden="true">iOS</span>
            <div>
              <h2 id="ios-identity-title">Apple app identity</h2>
              <p>Used to build the AASA appID as Team ID + Bundle ID.</p>
            </div>
          </div>
          <div className="onboarding-form-grid">
            <OnboardingTextField
              error={props.errors.iosBundleId}
              id="ios-bundle-id"
              label="iOS Bundle ID"
              onBlur={() => props.onFieldBlur('iosBundleId')}
              onChange={(value) => props.onFieldChange('iosBundleId', value)}
              placeholder="com.oberoimall.app"
              required
              value={props.form.iosBundleId}
            />
            <OnboardingTextField
              error={props.errors.iosTeamId}
              id="apple-team-id"
              label="Apple Team ID"
              maxLength={10}
              onBlur={() => props.onFieldBlur('iosTeamId')}
              onChange={(value) => props.onFieldChange('iosTeamId', value.toUpperCase())}
              placeholder="A1B2C3D4E5"
              required
              value={props.form.iosTeamId}
            />
          </div>
          <details className="onboarding-guidance">
            <summary>Where do I find these?</summary>
            <p>
              Find the Bundle ID in Xcode under Target → Signing &amp; Capabilities. Find the Team
              ID in Apple Developer → Membership details. Ask the iOS team if you do not have
              access.
            </p>
          </details>
        </section>
      ) : null}

      {includesAndroid(props.form.platform) ? (
        <section aria-labelledby="android-identity-title" className="onboarding-platform-panel">
          <div className="onboarding-platform-title">
            <span aria-hidden="true">A</span>
            <div>
              <h2 id="android-identity-title">Android app identity</h2>
              <p>Used to publish the Digital Asset Links statement.</p>
            </div>
          </div>
          <div className="onboarding-form-grid">
            <OnboardingTextField
              error={props.errors.androidPackageName}
              id="android-package"
              label="Android application ID"
              onBlur={() => props.onFieldBlur('androidPackageName')}
              onChange={(value) => props.onFieldChange('androidPackageName', value)}
              placeholder="com.oberoimall.app"
              required
              value={props.form.androidPackageName}
            />
            <OnboardingTextArea
              error={props.errors.androidSha256CertFingerprints}
              help="One colon-separated SHA-256 fingerprint per line. Add release and Play App Signing certificates when both are used."
              id="android-sha"
              label="Signing certificate SHA-256"
              onBlur={() => props.onFieldBlur('androidSha256CertFingerprints')}
              onChange={(value) =>
                props.onFieldChange('androidSha256CertFingerprints', value.toUpperCase())
              }
              placeholder="AA:BB:CC:…"
              required
              rows={4}
              spellCheck={false}
              value={props.form.androidSha256CertFingerprints}
            />
          </div>
          <details className="onboarding-guidance">
            <summary>Where do I find these?</summary>
            <p>
              Find the application ID in the app module’s Gradle configuration. For Play App
              Signing, copy SHA-256 from Play Console → Setup → App integrity. Your Android team can
              also export it from the release keystore.
            </p>
          </details>
        </section>
      ) : null}
    </section>
  )
}
