import { http, HttpResponse } from 'msw'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAccessibilityViolations } from '../test/axe'
import { server } from '../test/server'
import { AppAuthProvider, type AppAuthValue } from './authentication'
import {
  AccountAreaPage,
  AccountLayout,
  AccountOverviewPage,
  AccountSettingsPage,
} from './account'

function authValue(overrides: Partial<AppAuthValue> = {}): AppAuthValue {
  return {
    configured: true,
    loaded: true,
    signedIn: true,
    userId: 'user_demo',
    displayName: 'Demo Person',
    email: 'demo@example.com',
    getToken: async () => 'clerk-session-token',
    manageAccount: () => undefined,
    signOut: async () => undefined,
    ...overrides,
  }
}

function renderAccount(path = '/account', auth = authValue()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppAuthProvider value={auth}>
        <Routes>
          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<AccountOverviewPage />} />
            <Route path="characters" element={<AccountAreaPage area="characters" />} />
            <Route path="symbols" element={<AccountAreaPage area="symbols" />} />
            <Route path="packs" element={<AccountAreaPage area="packs" />} />
            <Route path="settings" element={<AccountSettingsPage />} />
          </Route>
          <Route path="/search" element={<p>Public search</p>} />
        </Routes>
      </AppAuthProvider>
    </MemoryRouter>,
  )
}

describe('account dashboard', () => {
  it('renders the identity, accessible navigation, overview cards, and initials fallback', async () => {
    const view = renderAccount()

    expect(screen.getByRole('heading', { name: 'Demo Person' })).toBeVisible()
    expect(screen.getByText('Your Open Symbols account')).toBeVisible()
    expect(screen.getByText('demo@example.com')).toBeVisible()
    expect(screen.getByText('DP')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'My Characters' })).toHaveAttribute('href', '/account/characters')
    expect(screen.getByRole('link', { name: 'My Symbols' })).toHaveAttribute('href', '/account/symbols')
    expect(screen.getByRole('link', { name: 'Symbol Packs' })).toHaveAttribute('href', '/account/packs')
    expect(screen.getByRole('link', { name: 'Explore symbols' })).toHaveAttribute('href', '/search')
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()

    await waitFor(() => expect(screen.queryByText(/Checking your secure server session/)).not.toBeInTheDocument())
    await expectNoAccessibilityViolations(view.container)
  })

  it.each([
    ['/account/characters', 'Characters are coming soon', 'My Characters'],
    ['/account/symbols', 'Personalized symbols are coming soon', 'My Symbols'],
    ['/account/packs', 'Symbol packs are coming soon', 'Symbol Packs'],
  ])('renders the truthful empty state at %s', async (path, heading, activeLink) => {
    const view = renderAccount(path)

    expect(screen.getByRole('heading', { name: heading })).toBeVisible()
    expect(screen.getByText('Coming soon')).toBeVisible()
    expect(screen.getByRole('link', { name: activeLink })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: /create|save|upload/i })).not.toBeInTheDocument()

    await waitFor(() => expect(screen.queryByText(/Checking your secure server session/)).not.toBeInTheDocument())
    await expectNoAccessibilityViolations(view.container)
  })

  it('uses the Clerk avatar and exposes account-management actions in settings', async () => {
    const user = userEvent.setup()
    const manageAccount = vi.fn()
    const signOut = vi.fn(async () => undefined)
    const view = renderAccount('/account/settings', authValue({
      imageUrl: 'https://images.example.test/avatar.png',
      manageAccount,
      signOut,
    }))

    const settings = screen.getByRole('heading', { name: 'Account settings' }).closest<HTMLElement>('.account-section')
    expect(settings).not.toBeNull()
    expect(settings!.querySelector('img')).toHaveAttribute('src', 'https://images.example.test/avatar.png')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(settings!).getByRole('button', { name: 'Manage account' }))
    await user.click(within(settings!).getByRole('button', { name: 'Sign out' }))
    expect(manageAccount).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledOnce()

    await waitFor(() => expect(screen.queryByText(/Checking your secure server session/)).not.toBeInTheDocument())
    await expectNoAccessibilityViolations(view.container)
  })

  it('reports a server verification failure without exposing the token', async () => {
    server.use(http.get('/api/app/session', () => HttpResponse.json({ error: 'authentication_required' }, { status: 401 })))
    const view = renderAccount()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('the server could not verify it')
    expect(view.container).not.toHaveTextContent('clerk-session-token')
    await expectNoAccessibilityViolations(view.container)
  })
})
