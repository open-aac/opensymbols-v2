import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAccessibilityViolations } from '../test/axe'
import {
  Avatar,
  Badge,
  BrandEndorsement,
  Button,
  ButtonAnchor,
  ButtonLink,
  CardLink,
  DescriptionList,
  EmptyState,
  FormActions,
  PageContainer,
  PageSection,
  PageState,
  ResponsiveGrid,
  SectionHeading,
  SelectField,
  StatusMessage,
  Surface,
  TextAreaField,
  TextField,
} from './ui'

describe('action primitives', () => {
  it.each(['primary', 'secondary', 'quiet'] as const)('renders the %s button variant with native props and a safe default type', (variant) => {
    render(<Button className="feature-action" data-track="continue" variant={variant}>Continue</Button>)
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('data-track', 'continue')
    expect(button).toHaveClass('action', `action--${variant}`, 'feature-action')
  })

  it('keeps router, document, and card navigation as links', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/search">Find symbols</ButtonLink>
        <ButtonAnchor href="https://example.com" target="_blank">External guide</ButtonAnchor>
        <CardLink className="feature-card" to="/account">Account card</CardLink>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Find symbols' })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: 'External guide' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.getByRole('link', { name: 'External guide' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Account card' })).toHaveClass('card-link', 'feature-card')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('BrandEndorsement', () => {
  it('renders a named link, visible preposition, controlled icon, and native props', () => {
    render(
      <BrandEndorsement
        href="https://example.org"
        brandName="ExampleOrg"
        iconSrc="https://example.org/brand.svg"
        className="feature-endorsement"
        data-track="endorsement"
        target="_blank"
      />,
    )

    const link = screen.getByRole('link', { name: 'by ExampleOrg' })
    expect(link).toHaveAttribute('href', 'https://example.org')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('data-track', 'endorsement')
    expect(link).toHaveClass('brand-endorsement', 'feature-endorsement')
    expect(link).toHaveTextContent(/^by$/)
    expect(link).not.toHaveTextContent('-')

    const image = link.querySelector('img')
    expect(image).toHaveAttribute('src', 'https://example.org/brand.svg')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('removes a failed image while retaining the reserved box and link', () => {
    render(<BrandEndorsement href="https://example.org" brandName="ExampleOrg" iconSrc="https://example.org/brand.svg" />)
    const link = screen.getByRole('link', { name: 'by ExampleOrg' })
    const icon = link.querySelector('.brand-endorsement__icon')
    fireEvent.error(link.querySelector('img') as HTMLImageElement)

    expect(screen.getByRole('link', { name: 'by ExampleOrg' })).toHaveAttribute('href', 'https://example.org')
    expect(icon).toBeInTheDocument()
    expect(icon).toBeEmptyDOMElement()
  })

  it('has no automated accessibility violations', async () => {
    const view = render(<BrandEndorsement href="https://example.org" brandName="ExampleOrg" iconSrc="https://example.org/brand.svg" />)
    await expectNoAccessibilityViolations(view.container)
  })
})

describe('form primitives', () => {
  it.each([
    ['textbox', <TextField id="name" label="Name" hint="Use a familiar word." error="Enter a name." loading data-kind="text" />],
    ['combobox', <SelectField id="locale" label="Locale" hint="Choose one." error="Choose a locale." loading data-kind="select"><option>English</option></SelectField>],
    ['textbox', <TextAreaField id="notes" label="Notes" hint="Keep it short." error="Enter notes." loading data-kind="textarea" />],
  ])('connects labels, descriptions, errors, loading, and native props for a %s', async (_role, component) => {
    const view = render(component)
    const control = screen.getByLabelText(component.props.label)

    expect(control).toBeDisabled()
    expect(control).toHaveAttribute('aria-busy', 'true')
    expect(control).toHaveAttribute('aria-invalid', 'true')
    expect(control).toHaveAttribute('data-kind')
    expect(control).toHaveAccessibleDescription(`${component.props.hint} ${component.props.error}`)
    expect(screen.getByRole('status')).toHaveTextContent(`${component.props.label} is loading.`)
    await expectNoAccessibilityViolations(view.container)
  })

  it('allows interaction when a text field is enabled and composes its wrapper class', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextField className="feature-field" id="query" label="Query" onChange={onChange} />)
    const input = screen.getByLabelText('Query')
    await user.type(input, 'hello')
    expect(onChange).toHaveBeenCalled()
    expect(input.closest('.field')).toHaveClass('feature-field')
  })

  it('groups form actions responsively and forwards container props', () => {
    render(<FormActions aria-label="Form actions" className="feature-actions"><Button>Cancel</Button></FormActions>)
    expect(screen.getByLabelText('Form actions')).toHaveClass('form-actions', 'feature-actions')
  })
})

describe('layout and content primitives', () => {
  it('renders containers, sections, headings, and grids with class composition and rich content', () => {
    render(
      <PageContainer className="feature-container" data-layout="page">
        <PageSection aria-label="Examples" className="feature-section">
          <SectionHeading
            className="feature-heading"
            id="examples-heading"
            title={<>Symbol <em>examples</em></>}
            description="A useful sample."
            action={<Button>Refresh</Button>}
          />
          <ResponsiveGrid aria-labelledby="examples-heading" className="feature-grid"><span>Item</span></ResponsiveGrid>
        </PageSection>
      </PageContainer>,
    )

    expect(document.querySelector('.page-container')).toHaveClass('feature-container')
    expect(screen.getByRole('region', { name: 'Examples' })).toHaveClass('page-section', 'feature-section')
    expect(screen.getByRole('heading', { name: 'Symbol examples' })).toHaveAttribute('id', 'examples-heading')
    expect(document.querySelector('.section-heading')).toHaveClass('feature-heading')
    expect(document.querySelector('.responsive-grid')).toHaveClass('feature-grid')
  })

  it.each(['default', 'muted', 'accent', 'danger'] as const)('renders the %s surface tone and native props', (tone) => {
    render(<Surface aria-label={`${tone} panel`} className="feature-surface" tone={tone}>Panel</Surface>)
    expect(screen.getByLabelText(`${tone} panel`)).toHaveClass('surface', `surface--${tone}`, 'feature-surface')
  })

  it('renders badge, avatar image, and deterministic avatar fallback', () => {
    const { rerender } = render(<><Badge className="feature-badge">Coming soon</Badge><Avatar className="feature-avatar" name="Demo Person" /></>)
    expect(screen.getByText('Coming soon')).toHaveClass('badge', 'feature-badge')
    expect(screen.getByText('DP')).toHaveAttribute('aria-hidden', 'true')

    rerender(<Avatar imageUrl="https://images.example/avatar.png" name="Demo Person" />)
    expect(document.querySelector('.avatar img')).toHaveAttribute('src', 'https://images.example/avatar.png')
    expect(document.querySelector('.avatar img')).toHaveAttribute('alt', '')
  })

  it('renders optional empty-state content and a working action slot', async () => {
    const action = vi.fn()
    const view = render(
      <EmptyState
        eyebrow="Your library"
        badge={<Badge>Coming soon</Badge>}
        heading="Nothing saved"
        description={<>Saved <strong>symbols</strong> will appear here.</>}
        action={<Button onClick={action}>Explore</Button>}
      />,
    )
    screen.getByRole('button', { name: 'Explore' }).click()
    expect(action).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: 'Nothing saved' })).toBeVisible()
    expect(screen.getByText('Your library')).toBeVisible()
    await expectNoAccessibilityViolations(view.container)
  })

  it('uses explicit live-region semantics and description-list markup', () => {
    render(
      <>
        <StatusMessage status="status">Loading</StatusMessage>
        <StatusMessage status="alert">Failed</StatusMessage>
        <DescriptionList
          aria-label="Symbol details"
          className="feature-details"
          items={[
            { term: 'Licence', description: <a href="/licence">CC BY</a> },
            { term: 'Author', description: 'Example Artist' },
          ]}
        />
      </>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.getByRole('alert')).toHaveClass('status-message--danger')
    const list = document.querySelector('dl[aria-label="Symbol details"]') as HTMLElement
    expect(list).toHaveClass('description-list', 'feature-details')
    expect(within(list).getAllByRole('term')).toHaveLength(2)
  })

  it('handles PageState loading, errors, retry, and loaded content', () => {
    const retry = vi.fn()
    const { rerender } = render(<PageState loading onRetry={retry}><p>Loaded</p></PageState>)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')

    rerender(<PageState loading={false} error={new Error('offline')} onRetry={retry}><p>Loaded</p></PageState>)
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(retry).toHaveBeenCalledOnce()

    rerender(<PageState loading={false} onRetry={retry}><p>Loaded</p></PageState>)
    expect(screen.getByText('Loaded')).toBeVisible()
  })
})
