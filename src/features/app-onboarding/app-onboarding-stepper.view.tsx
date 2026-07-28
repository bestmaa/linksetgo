import type { AppOnboardingStep, AppOnboardingStepItem } from './app-onboarding.types'

type AppOnboardingStepperProps = {
  onStepSelect: (step: AppOnboardingStep) => void
  steps: readonly AppOnboardingStepItem[]
}

export function AppOnboardingStepperView(props: AppOnboardingStepperProps) {
  return (
    <nav aria-label="App setup progress" className="onboarding-progress">
      <ol>
        {props.steps.map((step) => (
          <li className={`onboarding-progress-${step.state}`} key={step.id}>
            <button
              aria-current={step.state === 'current' ? 'step' : undefined}
              disabled={!step.canVisit}
              onClick={() => props.onStepSelect(step.id)}
              type="button"
            >
              <span aria-hidden="true" className="onboarding-progress-number">
                {step.state === 'complete' ? '✓' : step.number}
              </span>
              <span>
                <small>Step {step.number}</small>
                {step.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
