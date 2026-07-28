import type {
  AppOnboardingErrors,
  AppOnboardingField,
  AppOnboardingForm,
} from './app-onboarding.types'
import { OnboardingTextArea, OnboardingTextField } from './onboarding-field.view'

type BasicsStepProps = {
  errors: AppOnboardingErrors
  form: AppOnboardingForm
  onFieldBlur: (field: AppOnboardingField) => void
  onFieldChange: (field: AppOnboardingField, value: string) => void
}

export function BasicsStepView(props: BasicsStepProps) {
  return (
    <section aria-labelledby="app-onboarding-step-title" className="onboarding-step">
      <div className="onboarding-step-heading">
        <p className="eyebrow">App identity</p>
        <h1 id="app-onboarding-step-title" tabIndex={-1}>
          Name the mobile product
        </h1>
        <p>
          Start with the details your team and customers will recognize. Relay generates the app key
          from the name, and you can adjust it before creation.
        </p>
      </div>
      <div className="onboarding-form-grid">
        <OnboardingTextField
          autoFocus
          error={props.errors.name}
          id="app-name"
          label="App name"
          maxLength={120}
          onBlur={() => props.onFieldBlur('name')}
          onChange={(value) => props.onFieldChange('name', value)}
          placeholder="Oberoi Mall"
          required
          value={props.form.name}
        />
        <OnboardingTextField
          error={props.errors.slug}
          help="Used in every public link. Treat this key as permanent—changing it later breaks links already shared."
          id="app-key"
          label="Permanent app key"
          maxLength={80}
          onBlur={() => props.onFieldBlur('slug')}
          onChange={(value) => props.onFieldChange('slug', value)}
          placeholder="oberoi-mall"
          required
          value={props.form.slug}
        />
        <OnboardingTextField
          error={props.errors.nativeScheme}
          help="Ask the mobile team for the custom URL scheme. Enter only the scheme—not :// or a destination."
          id="native-scheme"
          label="Native URL scheme"
          maxLength={64}
          onBlur={() => props.onFieldBlur('nativeScheme')}
          onChange={(value) => props.onFieldChange('nativeScheme', value)}
          placeholder="oberoi"
          required
          spellCheck={false}
          value={props.form.nativeScheme}
        />
        <div className="onboarding-form-span">
          <OnboardingTextArea
            error={props.errors.description}
            help={`${props.form.description.length}/500 characters. Visible only to workspace members.`}
            id="app-description"
            label="Internal description"
            maxLength={500}
            onBlur={() => props.onFieldBlur('description')}
            onChange={(value) => props.onFieldChange('description', value)}
            placeholder="Loyalty, offers, parking and mall navigation app"
            rows={4}
            value={props.form.description}
          />
        </div>
      </div>
      <aside className="onboarding-callout">
        <strong>What customers will see</strong>
        <code>/l/{props.form.slug || 'your-app'}/welcome-offer</code>
        <span>The workspace domain and link slug are added when you create a deep link.</span>
      </aside>
    </section>
  )
}
