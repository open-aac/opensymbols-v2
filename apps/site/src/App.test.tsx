import { http, HttpResponse } from 'msw'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { server } from './test/server'

function renderApp(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

describe('legacy public discovery parity', () => {
  it('presents repositories by size, examples, and the legacy identity', async () => {
    renderApp()

    expect(screen.getByText('open-licensed communication symbols for everyone')).toBeInTheDocument()
    const repositoryLink = await screen.findByRole('link', { name: /demo symbols/i })
    expect(repositoryLink).toHaveTextContent('CC BY 4.0')
    const grid = document.querySelector<HTMLElement>('.repository-grid')
    expect(grid).not.toBeNull()
    expect(within(grid!).getAllByRole('link')[0]).toHaveTextContent('Demo Symbols')
    expect(screen.getByRole('heading', { name: 'Examples:' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Hello' })).toBeInTheDocument()
  })

  it('searches through URL state, clears, and exposes fallback actions', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.type(screen.getByLabelText('Search:'), 'hello')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByRole('link', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suggest a Symbol' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Google' })).toHaveAttribute('href', expect.stringContaining('hello'))
    expect(screen.queryByRole('heading', { name: 'Examples:' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByRole('heading', { name: 'Examples:' })).toBeInTheDocument()
  })

  it('submits the legacy honeypot symbol-request form', async () => {
    const user = userEvent.setup()
    renderApp('/search?q=bacon')

    await user.click(await screen.findByRole('button', { name: 'Suggest a Symbol' }))
    const form = screen.getByRole('heading', { name: 'Request a Different Symbol' }).closest('form')
    expect(form).not.toBeNull()
    await user.type(within(form!).getByLabelText(/first letter/i), 'b')
    await user.type(within(form!).getByLabelText('Description'), 'A clear picture of bacon')
    await user.click(within(form!).getByRole('button', { name: 'Request Symbol' }))

    expect(await screen.findByText(/submitted.*thank you/i)).toBeInTheDocument()
  })

  it('shows setup guidance for an empty database', async () => {
    server.use(http.get('/api/v2/repositories', () => HttpResponse.json({ repositories: [] })))
    renderApp()

    expect(await screen.findByText(/no symbol repositories are configured/i)).toBeInTheDocument()
    expect(screen.getByText('pnpm legacy:seed')).toBeInTheDocument()
  })

  it('renders repository metadata, filters, and pagination', async () => {
    const user = userEvent.setup()
    renderApp('/repositories/demo')

    expect(await screen.findByRole('heading', { name: 'Demo Symbols' })).toBeInTheDocument()
    expect(screen.getByText('Example Designer')).toBeInTheDocument()
    expect(screen.getByLabelText('Skin Tone')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'More Symbols' })).toBeInTheDocument()
    expect(document.querySelectorAll('.symbol-card')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'More Symbols' }))
    await waitFor(() => expect(document.querySelectorAll('.symbol-card')).toHaveLength(4))
    await user.selectOptions(screen.getByLabelText('Filter'), 'skins')
    await waitFor(() => expect(screen.getByLabelText('Filter')).toHaveValue('skins'))
  })

  it('renders symbol attribution and the legacy admin handoff', async () => {
    renderApp('/symbols/demo/hello-a1')

    expect(await screen.findByRole('heading', { name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit Symbol' })).toHaveAttribute(
      'href',
      '/admin/symbols/demo/hello-a1',
    )
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toBeInTheDocument()
    expect(screen.getByText('A person waving hello.')).toBeInTheDocument()
  })

  it('shows retryable API failures and an accessible not-found route', async () => {
    server.use(http.get('/api/v2/repositories', () => HttpResponse.json({}, { status: 503 })))
    const view = renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent('Loading failed')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    view.unmount()
    renderApp('/not-rebuilt')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to Open Symbols' })).toBeInTheDocument()
  })
})
