import { Button } from '@/components/ui/button'

import { AppOnboardingStepperView } from './app-onboarding-stepper.view'
import { AppOnboardingSuccessView } from './app-onboarding-success.view'
import type { AppOnboardingViewProps } from './app-onboarding.types'
import { BasicsStepView } from './basics-step.view'
import { DestinationsStepView } from './destinations-step.view'
import { PlatformsStepView } from './platforms-step.view'
import { ReviewStepView } from './review-step.view'

export function AppOnboardingView(props: AppOnboardingViewProps) {
  if (props.createdApp) {
    return (
      <AppOnboardingSuccessView
        app={props.createdApp}
        onBackToApps={props.onBackToApps}
        onCreateLink={props.onCreateLink}
        onOpenDraft={props.onOpenDraft}
      />
    )
  }

  const isFirstStep = props.step === 'basics'
  const isReviewStep = props.step === 'review'

  return (
    <main className="page onboarding-page">
      <header className="onboarding-page-header">
        <div>
          <p className="eyebrow">Mobile products</p>
          <span>Add an app</span>
          {props.workspaceName ? <small>to {props.workspaceName}</small> : null}
        </div>
        <Button onClick={props.onCancel} variant="quiet">
          Cancel setup
        </Button>
      </header>

      <AppOnboardingStepperView onStepSelect={props.onStepSelect} steps={props.steps} />

      <form className="onboarding-shell" noValidate onSubmit={props.onSubmit}>
        {!props.workspaceName ? (
          <p className="onboarding-workspace-error" role="alert">
            No workspace is selected. Cancel setup and create or select a workspace first.
          </p>
        ) : null}
        <div className="onboarding-content">
          {props.step === 'basics' ? (
            <BasicsStepView
              errors={props.errors}
              form={props.form}
              onFieldBlur={props.onFieldBlur}
              onFieldChange={props.onFieldChange}
              publicUrlPreview={props.publicUrlPreview}
            />
          ) : null}
          {props.step === 'platforms' ? (
            <PlatformsStepView
              errors={props.errors}
              form={props.form}
              onFieldBlur={props.onFieldBlur}
              onFieldChange={props.onFieldChange}
              onPlatformChange={props.onPlatformChange}
            />
          ) : null}
          {props.step === 'destinations' ? (
            <DestinationsStepView
              errors={props.errors}
              form={props.form}
              onFieldBlur={props.onFieldBlur}
              onFieldChange={props.onFieldChange}
            />
          ) : null}
          {isReviewStep ? <ReviewStepView form={props.form} /> : null}
        </div>

        <footer className="onboarding-footer">
          <div>
            {!isFirstStep ? (
              <Button disabled={props.isSaving} onClick={props.onBack} variant="secondary">
                Back
              </Button>
            ) : (
              <span />
            )}
          </div>
          <div>
            {props.submitError ? (
              <p className="form-error" role="alert">
                {props.submitError}
              </p>
            ) : null}
            {isReviewStep ? (
              <Button disabled={props.isSaving || !props.workspaceName} type="submit">
                {props.isSaving ? 'Creating draft…' : 'Create draft app'}
              </Button>
            ) : (
              <Button onClick={props.onNext}>Continue</Button>
            )}
          </div>
        </footer>
      </form>
    </main>
  )
}
