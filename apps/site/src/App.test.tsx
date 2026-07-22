import { http, HttpResponse } from 'msw'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { symbol } from './test/fixtures'
import { server } from './test/server'
import { expectNoAccessibilityViolations } from './test/axe'

function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

describe('public discovery', () => {
  it('presents the search-first hierarchy, repositories, examples, and primary navigation', async () => {
    const view = renderApp()

    expect(screen.getByRole('heading', { name: 'Find open communication symbols' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search symbols' })).toHaveAttribute('href', '/search')
    const repositoryLink = await screen.findByRole('link', { name: /demo symbols/i })
    expect(repositoryLink).toHaveTextContent('CC BY 4.0')
    expect(repositoryLink.querySelector('.repository-card__image-plate')).not.toBeNull()
    const grid = document.querySelector<HTMLElement>('.repository-grid')
    expect(grid).not.toBeNull()
    expect(within(grid!).getAllByRole('link')[0]).toHaveTextContent('Demo Symbols')
    expect(screen.getByRole('heading', { name: 'Symbol examples' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Hello/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Read the API documentation' })).toHaveAttribute('href', '/api')
    expect(
      screen.getByRole('search').compareDocumentPosition(screen.getByRole('heading', { name: 'Symbol examples' }))
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await expectNoAccessibilityViolations(view.container)
  })

  it('renders the legacy API reference at its public route', async () => {
    const view = renderApp('/api')

    expect(screen.getByRole('heading', { name: 'Open Symbols API Documentation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /POST.*\/api\/v2\/token/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /GET.*\/api\/v2\/symbols/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Request a Shared Secret' })).toBeInTheDocument()
    expect(screen.getByText(/URLs can be logged/)).toBeInTheDocument()
    expect(screen.getByText(/hc:1/)).toBeInTheDocument()
    expect(screen.getAllByText(/object-position/).length).toBeGreaterThan(0)
    expect(screen.getByText(/token_expired: true/)).toBeInTheDocument()
    expect(screen.getByText(/HTTP 429/)).toBeInTheDocument()
    expect(document.querySelector('.api-introduction')).not.toBeNull()
    expect(document.querySelectorAll('.api-runner-surface')).toHaveLength(3)
    await expectNoAccessibilityViolations(view.container)
  })

  it('submits a shared-secret application without retaining applicant data', async () => {
    const user = userEvent.setup()
    let submittedApplication = ''
    server.use(http.post('/api/v2/generate_secret', async ({ request }) => {
      submittedApplication = await request.text()
      return HttpResponse.json({ shared_secret: 'generated-shared-secret' })
    }))
    renderApp('/api')

    const applicationForm = screen.getByRole('heading', { name: 'Shared secret application' }).closest('form')
    expect(applicationForm).not.toBeNull()
    await user.type(within(applicationForm!).getByLabelText('Organization'), 'AAC Example')
    await user.type(within(applicationForm!).getByLabelText('Email'), 'hello@example.com')
    await user.type(within(applicationForm!).getByLabelText('Purpose'), 'Testing symbol search')
    await user.click(within(applicationForm!).getByRole('button', { name: 'Submit application' }))

    expect(await within(applicationForm!).findByText(/generated-shared-secret/)).toBeInTheDocument()
    const applicationParameters = new URLSearchParams(submittedApplication)
    expect(applicationParameters.get('org_name')).toBe('AAC Example')
    expect(applicationParameters.get('org_email')).toBe('hello@example.com')
    expect(applicationParameters.get('org_purpose')).toBe('Testing symbol search')
    expect(within(applicationForm!).getByLabelText('Organization')).toHaveValue('')
    expect(within(applicationForm!).getByLabelText('Email')).toHaveValue('')
    expect(within(applicationForm!).getByLabelText('Purpose')).toHaveValue('')
    expect(window.localStorage).toHaveLength(0)
    expect(window.sessionStorage).toHaveLength(0)
  })

  it('exchanges a secret without retaining it and carries the access token into search', async () => {
    const user = userEvent.setup()
    let submittedSecret = ''
    let authorization = ''
    let searchParameters = ''
    server.use(
      http.post('/api/v2/token', async ({ request }) => {
        submittedSecret = new URLSearchParams(await request.text()).get('secret') || ''
        return HttpResponse.json({ access_token: 'token::generated', expires: '2026-07-18T12:00:00Z' })
      }),
      http.get('/api/v2/symbols', ({ request }) => {
        authorization = request.headers.get('Authorization') || ''
        searchParameters = new URL(request.url).searchParams.toString()
        return HttpResponse.json([symbol])
      }),
    )
    renderApp('/api')

    const tokenForm = screen.getByRole('heading', { name: 'Generate an access token' }).closest('form')
    expect(tokenForm).not.toBeNull()
    const secretInput = within(tokenForm!).getByLabelText('Shared secret')
    await user.type(secretInput, 'local-development-shared-secret')
    await user.click(within(tokenForm!).getByRole('button', { name: 'Submit' }))

    expect(await within(tokenForm!).findByText(/HTTP 200/)).toBeInTheDocument()
    expect(submittedSecret).toBe('local-development-shared-secret')
    expect(secretInput).toHaveValue('')
    expect(window.localStorage).toHaveLength(0)
    expect(window.sessionStorage).toHaveLength(0)

    const searchForm = screen.getByRole('heading', { name: 'Try symbol search' }).closest('form')
    expect(searchForm).not.toBeNull()
    expect(within(searchForm!).getByLabelText('Access token')).toHaveValue('token::generated')
    await user.type(within(searchForm!).getByLabelText('Search terms'), 'hello world')
    await user.clear(within(searchForm!).getByLabelText('Locale'))
    await user.type(within(searchForm!).getByLabelText('Locale'), 'es')
    await user.selectOptions(within(searchForm!).getByLabelText('Safe search'), '0')
    await user.click(within(searchForm!).getByRole('button', { name: 'Submit' }))

    expect(await within(searchForm!).findByText(/HTTP 200/)).toBeInTheDocument()
    expect(authorization).toBe('token::generated')
    expect(searchParameters).toBe('q=hello+world&locale=es&safe=0')
  })

  it('formats and truncates non-JSON API failures without clearing the secret', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/v2/token', () => new HttpResponse('x'.repeat(8_100), { status: 502 })))
    renderApp('/api')

    const tokenForm = screen.getByRole('heading', { name: 'Generate an access token' }).closest('form')
    expect(tokenForm).not.toBeNull()
    const secretInput = within(tokenForm!).getByLabelText('Shared secret')
    await user.type(secretInput, 'invalid-secret')
    await user.click(within(tokenForm!).getByRole('button', { name: 'Submit' }))

    expect(await within(tokenForm!).findByText(/HTTP 502/)).toHaveTextContent('[response truncated]')
    expect(secretInput).toHaveValue('invalid-secret')
  })

  it('searches through URL state, clears, and exposes fallback actions', async () => {
    const user = userEvent.setup()
    const view = renderApp()

    await user.type(screen.getByLabelText('Search symbols'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('link', { name: /Hello/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Results for “hello”' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 symbol found')
    expect(screen.getByRole('button', { name: 'Suggest a symbol' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search Google Images' })).toHaveAttribute('href', expect.stringContaining('hello'))
    expect(screen.queryByRole('heading', { name: 'Symbol examples' })).not.toBeInTheDocument()
    await expectNoAccessibilityViolations(view.container)

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(await screen.findByRole('heading', { name: 'Symbol examples' })).toBeInTheDocument()
  })

  it('submits the legacy honeypot symbol-request form', async () => {
    const user = userEvent.setup()
    renderApp('/search?q=bacon')

    await user.click(await screen.findByRole('button', { name: 'Suggest a symbol' }))
    const form = screen.getByRole('heading', { name: 'Request a different symbol' }).closest('form')
    expect(form).not.toBeNull()
    await user.type(within(form!).getByLabelText(/first letter/i), 'b')
    await user.type(within(form!).getByLabelText('Description'), 'A clear picture of bacon')
    await user.click(within(form!).getByRole('button', { name: 'Request symbol' }))

    expect(await screen.findByText(/submitted.*thank you/i)).toBeInTheDocument()
  })

  it('shows setup guidance for an empty database', async () => {
    server.use(http.get('/api/v2/repositories', () => HttpResponse.json({ repositories: [] })))
    const view = renderApp()

    expect(await screen.findByText(/no symbol repositories are configured/i)).toBeInTheDocument()
    expect(screen.getByText('pnpm legacy:seed')).toBeInTheDocument()
    await expectNoAccessibilityViolations(view.container)
  })

  it('renders repository metadata, filters, and pagination', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = renderApp('/repositories/demo')

    expect(await screen.findByRole('heading', { name: 'Demo Symbols' })).toBeInTheDocument()
    expect(screen.getByText('Example Designer')).toBeInTheDocument()
    expect(screen.getByLabelText('Skin Tone')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'More Symbols' })).toBeInTheDocument()
    expect(document.querySelectorAll('.symbol-card')).toHaveLength(2)
    expect(document.querySelector('.symbol-grid')).toHaveClass('responsive-grid')
    expect(document.querySelector('.repository-summary')).not.toBeNull()
    expect(document.querySelector('.repository-controls')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'More Symbols' }))
    await waitFor(() => expect(document.querySelectorAll('.symbol-card')).toHaveLength(4))
    expect(consoleError.mock.calls.some((call) => call.some((value) => String(value).includes('same key')))).toBe(false)
    await user.selectOptions(screen.getByLabelText('Filter'), 'skins')
    await waitFor(() => expect(screen.getByLabelText('Filter')).toHaveValue('skins'))
    await expectNoAccessibilityViolations(view.container)
    consoleError.mockRestore()
  })

  it('renders symbol attribution without a public admin handoff', async () => {
    const view = renderApp('/symbols/demo/hello-a1')

    expect(await screen.findByRole('heading', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit Symbol' })).not.toBeInTheDocument()
    expect(screen.queryByText('Actions')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toBeInTheDocument()
    expect(screen.getByText('A person waving hello.')).toBeInTheDocument()
    expect(document.querySelector('.symbol-detail__media')).not.toBeNull()
    await expectNoAccessibilityViolations(view.container)
  })

  it('shows retryable API failures and an accessible not-found route', async () => {
    server.use(http.get('/api/v2/repositories', () => HttpResponse.json({}, { status: 503 })))
    const view = renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent('Loading failed')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    await expectNoAccessibilityViolations(view.container)

    view.unmount()
    const notFoundView = renderApp('/not-rebuilt')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to Open Symbols' })).toBeInTheDocument()
    expect(document.querySelector('.not-found')).not.toBeNull()
    await expectNoAccessibilityViolations(notFoundView.container)
  })
})
