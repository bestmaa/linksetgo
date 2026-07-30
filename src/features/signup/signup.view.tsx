import Link from 'next/link'
import type { ChangeEventHandler } from 'react'

import { BrandMark } from '@/components/ui/brand-mark'
import { Button } from '@/components/ui/button'

import type { SignupField, SignupViewProps } from './signup.types'

const fieldError = (props: SignupViewProps, field: SignupField): string | undefined =>
  props.state.status === 'error' && props.state.field === field ? props.state.message : undefined

export function SignupView(props: SignupViewProps) {
  const isSubmitting = props.state.status === 'submitting'

  return (
    <main className="auth-page signup-page">
      <section className="auth-form-side">
        <div className="auth-card signup-card">
          <div className="auth-brand">
            <BrandMark />
            <span>
              <span className="brand-name">LinksetGo</span>
              <span className="brand-caption" style={{ color: '#667085' }}>
                CLOUD
              </span>
            </span>
          </div>

          {!props.available ? (
            <UnavailableSignup />
          ) : props.state.status === 'success' ? (
            <SignupSuccess email={props.email} />
          ) : (
            <>
              <h1>Create your workspace</h1>
              <p>
                Sign up free, then paste a mobile URL to get a shareable link. No card required.
              </p>
              <form className="auth-form signup-form" method="post" onSubmit={props.onSubmit}>
                <TextField
                  autoComplete="name"
                  error={fieldError(props, 'name')}
                  id="signup-name"
                  label="Your name"
                  onChange={props.onNameChange}
                  placeholder="Aarav Sharma"
                  value={props.name}
                />
                <TextField
                  autoComplete="email"
                  error={fieldError(props, 'email')}
                  id="signup-email"
                  label="Work email"
                  onChange={props.onEmailChange}
                  placeholder="you@example.com"
                  type="email"
                  value={props.email}
                />
                <TextField
                  autoComplete="new-password"
                  error={fieldError(props, 'password')}
                  help="12+ characters with upper, lower, number, and symbol."
                  id="signup-password"
                  label="Password"
                  onChange={props.onPasswordChange}
                  placeholder="Create a strong password"
                  type={props.showPassword ? 'text' : 'password'}
                  value={props.password}
                />
                <label className="auth-checkbox auth-password-toggle">
                  <input
                    checked={props.showPassword}
                    onChange={props.onShowPasswordChange}
                    type="checkbox"
                  />
                  <span>Show password</span>
                </label>
                <label className="auth-checkbox">
                  <input
                    aria-describedby="signup-terms-help"
                    aria-invalid={Boolean(fieldError(props, 'acceptTerms'))}
                    checked={props.acceptTerms}
                    onChange={props.onAcceptTermsChange}
                    required
                    type="checkbox"
                  />
                  <span id="signup-terms-help">
                    I agree to the <Link href="/terms">Terms</Link> and{' '}
                    <Link href="/privacy">Privacy Policy</Link>.
                  </span>
                </label>
                {fieldError(props, 'acceptTerms') ? (
                  <p className="form-error" role="alert">
                    {fieldError(props, 'acceptTerms')}
                  </p>
                ) : null}
                {props.state.status === 'error' &&
                (!props.state.field || props.state.field === 'form') ? (
                  <p className="form-error" role="alert">
                    {props.state.message}
                  </p>
                ) : null}
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? 'Creating workspace…' : 'Create free workspace'}
                </Button>
              </form>
              <p className="auth-footer">
                Already have an account? <Link href="/admin/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </section>
      <aside className="auth-visual" aria-label="LinksetGo Cloud workspace introduction">
        <div className="auth-message">
          <span aria-hidden="true" className="auth-message-symbol">
            ↗
          </span>
          <h2>Paste an app URL. Share the HTTPS link.</h2>
          <p>
            Start simple on LinksetGo&apos;s shared domain. Add stores or a verified fallback later.
          </p>
        </div>
      </aside>
    </main>
  )
}

type TextFieldProps = {
  autoComplete?: string | undefined
  error?: string | undefined
  help?: string | undefined
  id: string
  label: string
  maxLength?: number | undefined
  onChange: ChangeEventHandler<HTMLInputElement>
  placeholder: string
  type?: 'email' | 'password' | 'text' | undefined
  value: string
}

function TextField(props: TextFieldProps) {
  const descriptionID = props.error
    ? `${props.id}-error`
    : props.help
      ? `${props.id}-help`
      : undefined
  return (
    <label className="form-group" htmlFor={props.id}>
      <span className="form-label">{props.label}</span>
      <input
        aria-describedby={descriptionID}
        aria-invalid={Boolean(props.error)}
        autoComplete={props.autoComplete}
        className="field"
        id={props.id}
        maxLength={props.maxLength}
        name={props.id}
        onChange={props.onChange}
        placeholder={props.placeholder}
        required
        type={props.type ?? 'text'}
        value={props.value}
      />
      {props.error ? (
        <span className="form-error" id={`${props.id}-error`} role="alert">
          {props.error}
        </span>
      ) : props.help ? (
        <span className="form-help" id={`${props.id}-help`}>
          {props.help}
        </span>
      ) : null}
    </label>
  )
}

function SignupSuccess(props: { email: string }) {
  return (
    <div className="auth-result" role="status">
      <span aria-hidden="true" className="auth-result-icon">
        ✓
      </span>
      <h1>Check your email</h1>
      <p>
        We sent a one-time verification link to <strong>{props.email}</strong>. It expires in 24
        hours.
      </p>
      <Link className="auth-secondary-link" href="/resend-verification">
        Didn&apos;t receive it? Send another link
      </Link>
      <Link className="button button-secondary" href="/admin/login">
        Back to sign in
      </Link>
    </div>
  )
}

function UnavailableSignup() {
  return (
    <div className="auth-result">
      <h1>Signup is not available</h1>
      <p>This installation does not accept public accounts. Ask its owner for access.</p>
      <Link className="button button-primary" href="/admin/login">
        Go to sign in
      </Link>
      <Link className="auth-secondary-link" href="/open-source">
        Self-host LinksetGo Community
      </Link>
    </div>
  )
}
