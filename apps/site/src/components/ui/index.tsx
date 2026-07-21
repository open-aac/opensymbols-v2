import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useState } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import './styles.css'

export type ActionVariant = 'primary' | 'secondary' | 'quiet'
export type SurfaceTone = 'default' | 'muted' | 'accent' | 'danger'

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(' ')
}

function actionClass(variant: ActionVariant, className?: string) {
  return classes('action', `action--${variant}`, className)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant
}

/** Native button with a 44px target. Secondary is the safe visual default. */
export function Button({ variant = 'secondary', className, type = 'button', ...props }: ButtonProps) {
  return <button className={actionClass(variant, className)} type={type} {...props} />
}

export interface ButtonLinkProps extends LinkProps {
  variant?: ActionVariant
}

/** Client-side router link styled as an action without changing link semantics. */
export function ButtonLink({ variant = 'secondary', className, ...props }: ButtonLinkProps) {
  return <Link className={actionClass(variant, className)} {...props} />
}

export interface ButtonAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ActionVariant
}

/** External or full-document link styled as an action. */
export function ButtonAnchor({ variant = 'secondary', className, children, ...props }: ButtonAnchorProps) {
  return <a className={actionClass(variant, className)} {...props}>{children}</a>
}

export interface BrandEndorsementProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label' | 'children'> {
  href: string
  brandName: string
  iconSrc: string
}

/** Compact brand credit with a computed accessible name and decorative remote icon. */
export function BrandEndorsement({ href, brandName, iconSrc, className, ...props }: BrandEndorsementProps) {
  const [iconFailed, setIconFailed] = useState(false)

  return (
    <a
      {...props}
      className={classes('brand-endorsement', className)}
      href={href}
      aria-label={`by ${brandName}`}
    >
      <span aria-hidden="true">by</span>
      <span className="brand-endorsement__icon">
        {!iconFailed && (
          <img
            src={iconSrc}
            alt=""
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setIconFailed(true)}
          />
        )}
      </span>
    </a>
  )
}

export type CardLinkProps = LinkProps

/** Full-surface card navigation; callers provide the visible accessible name. */
export function CardLink({ className, ...props }: CardLinkProps) {
  return <Link className={classes('card-link', className)} {...props} />
}

interface FieldContentProps {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  loading?: boolean
  className?: string
}

function FieldContent({ id, label, hint, error, loading, children, className }: FieldContentProps & { children: ReactNode }) {
  return (
    <div className={classes('field', className)}>
      <label className="field__label" htmlFor={id}>{label}</label>
      {hint && <span className="field__hint" id={`${id}-hint`}>{hint}</span>}
      {children}
      {loading && <span className="visually-hidden" role="status">{label} is loading.</span>}
      {error && <span className="field__error" id={`${id}-error`}>{error}</span>}
    </div>
  )
}

function fieldDescription(id: string, hint?: ReactNode, error?: ReactNode) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>, FieldContentProps {}

export function TextField({ id, label, hint, error, loading = false, className, disabled, ...props }: TextFieldProps) {
  return (
    <FieldContent {...{ id, label, hint, error, loading, className }}>
      <input
        className="field__control"
        id={id}
        aria-describedby={fieldDescription(id, hint, error)}
        aria-invalid={error ? true : undefined}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
      />
    </FieldContent>
  )
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>, FieldContentProps {}

export function SelectField({ id, label, hint, error, loading = false, className, disabled, children, ...props }: SelectFieldProps) {
  return (
    <FieldContent {...{ id, label, hint, error, loading, className }}>
      <select
        className="field__control"
        id={id}
        aria-describedby={fieldDescription(id, hint, error)}
        aria-invalid={error ? true : undefined}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
      >
        {children}
      </select>
    </FieldContent>
  )
}

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>, FieldContentProps {}

export function TextAreaField({ id, label, hint, error, loading = false, className, disabled, ...props }: TextAreaFieldProps) {
  return (
    <FieldContent {...{ id, label, hint, error, loading, className }}>
      <textarea
        className="field__control"
        id={id}
        aria-describedby={fieldDescription(id, hint, error)}
        aria-invalid={error ? true : undefined}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
      />
    </FieldContent>
  )
}

export type FormActionsProps = HTMLAttributes<HTMLDivElement>

export function FormActions({ className, ...props }: FormActionsProps) {
  return <div className={classes('form-actions', className)} {...props} />
}

export type PageContainerProps = HTMLAttributes<HTMLDivElement>

export function PageContainer({ className, ...props }: PageContainerProps) {
  return <div className={classes('page-container', className)} {...props} />
}

export type PageSectionProps = HTMLAttributes<HTMLElement>

export function PageSection({ className, ...props }: PageSectionProps) {
  return <section className={classes('page-section', className)} {...props} />
}

export interface SectionHeadingProps extends Omit<HTMLAttributes<HTMLDivElement>, 'id' | 'title'> {
  id?: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function SectionHeading({ title, description, action, id, className, ...props }: SectionHeadingProps) {
  return (
    <div className={classes('section-heading', className)} {...props}>
      <div>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </div>
  )
}

export type ResponsiveGridProps = HTMLAttributes<HTMLDivElement>

export function ResponsiveGrid({ className, ...props }: ResponsiveGridProps) {
  return <div className={classes('responsive-grid', className)} {...props} />
}

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone
}

export function Surface({ tone = 'default', className, ...props }: SurfaceProps) {
  return <div className={classes('surface', `surface--${tone}`, className)} {...props} />
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement>

export function Badge({ className, ...props }: BadgeProps) {
  return <span className={classes('badge', className)} {...props} />
}

function initials(name?: string) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (!parts.length) return 'OS'
  return `${parts[0]?.[0] ?? 'O'}${parts.length > 1 ? parts.at(-1)?.[0] ?? '' : ''}`.toUpperCase()
}

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'aria-hidden' | 'children'> {
  imageUrl?: string
  name?: string
  fallback?: string
}

/** Identity is supplied by adjacent text, so both image and fallback are decorative. */
export function Avatar({ imageUrl, name, fallback, className, ...props }: AvatarProps) {
  return (
    <span className={classes('avatar', className)} {...props} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" /> : (fallback || initials(name))}
    </span>
  )
}

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  heading: ReactNode
  description: ReactNode
  eyebrow?: ReactNode
  badge?: ReactNode
  action?: ReactNode
}

export function EmptyState({ heading, description, eyebrow, badge, action, className, ...props }: EmptyStateProps) {
  return (
    <div className={classes('empty-state', className)} {...props}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      {badge && <div className="empty-state__badge">{badge}</div>}
      <h2>{heading}</h2>
      <p>{description}</p>
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}

export interface StatusMessageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role'> {
  status: 'status' | 'alert'
  tone?: SurfaceTone
}

export function StatusMessage({ status, tone = status === 'alert' ? 'danger' : 'default', className, ...props }: StatusMessageProps) {
  return <div className={classes('status-message', `status-message--${tone}`, className)} {...props} role={status} />
}

export interface DescriptionListItem {
  term: ReactNode
  description: ReactNode
}

export interface DescriptionListProps extends HTMLAttributes<HTMLDListElement> {
  items: DescriptionListItem[]
}

export function DescriptionList({ items, className, ...props }: DescriptionListProps) {
  return (
    <dl className={classes('description-list', className)} {...props}>
      {items.map((item, index) => (
        <div className="description-list__item" key={index}>
          <dt>{item.term}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface PageStateProps {
  loading: boolean
  error?: Error
  onRetry: () => void
  loadingLabel?: ReactNode
  children: ReactNode
}

export function PageState({ loading, error, onRetry, loadingLabel = 'Loading…', children }: PageStateProps) {
  if (loading) return <StatusMessage status="status">{loadingLabel}</StatusMessage>

  if (error) {
    return (
      <StatusMessage status="alert">
        <h2>Loading failed</h2>
        <p>The Open Symbols service may be unavailable.</p>
        <Button onClick={onRetry}>Try again</Button>
      </StatusMessage>
    )
  }

  return children
}
