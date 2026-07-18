import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import './ui.css'

type ActionVariant = 'primary' | 'secondary' | 'quiet'

function actionClass(variant: ActionVariant, className?: string) {
  return ['action', `action--${variant}`, className].filter(Boolean).join(' ')
}

/** Native button with a 44px target. Secondary is the safe visual default. */
export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ActionVariant }) {
  return <button className={actionClass(variant, className)} type={type} {...props} />
}

/** Router link styled as an action without changing link semantics. */
export function ButtonLink({
  variant = 'secondary',
  className,
  ...props
}: LinkProps & { variant?: ActionVariant }) {
  return <Link className={actionClass(variant, className)} {...props} />
}

/** Full-surface card navigation; callers provide the visible accessible name. */
export function CardLink({ className, ...props }: LinkProps) {
  return <Link className={['card-link', className].filter(Boolean).join(' ')} {...props} />
}

/** Native text input with connected hint, error, disabled, and loading semantics. */
export function TextField({
  id,
  label,
  hint,
  error,
  loading = false,
  className,
  disabled,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  hint?: string
  error?: string
  loading?: boolean
}) {
  const description = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined

  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>{label}</label>
      {hint && <span className="field__hint" id={`${id}-hint`}>{hint}</span>}
      <input
        className="field__control"
        id={id}
        aria-describedby={description}
        aria-invalid={error ? true : undefined}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
      />
      {loading && <span className="visually-hidden" role="status">{label} is loading.</span>}
      {error && <span className="field__error" id={`${id}-error`}>{error}</span>}
    </div>
  )
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['page-container', className].filter(Boolean).join(' ')}>{children}</div>
}

export function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </div>
  )
}

export function ResponsiveGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['responsive-grid', className].filter(Boolean).join(' ')}>{children}</div>
}
