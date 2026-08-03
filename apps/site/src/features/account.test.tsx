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
import { CharacterBuilderPage } from './character-builder'
import { skinColourOptions } from './character-template'

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
            <Route path="characters" element={<CharacterBuilderPage />} />
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
    const user = userEvent.setup()
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

    const accountNavigation = screen.getByRole('navigation', { name: 'Account navigation' })
    const navigationLinks = within(accountNavigation).getAllByRole('link')
    expect(navigationLinks.map((link) => link.textContent)).toEqual([
      'Overview',
      'My Characters',
      'My Symbols',
      'Symbol Packs',
      'Settings',
    ])
    for (const link of navigationLinks) {
      await user.tab()
      expect(link).toHaveFocus()
    }

    await waitFor(() => expect(screen.queryByText(/Checking your secure server session/)).not.toBeInTheDocument())
    await expectNoAccessibilityViolations(view.container)
  })

  it.each([
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

  it('offers an accessible prototype skin-colour preview and releases generated image URLs', async () => {
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectURL = vi.fn(() => `blob:character-${createObjectURL.mock.calls.length}`)
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })

    const user = userEvent.setup()
    const view = renderAccount('/account/characters')

    try {
      expect(screen.getByRole('heading', { name: 'Build your character' })).toBeVisible()
      expect(screen.getByText('Prototype')).toBeVisible()
      expect(screen.getByRole('link', { name: 'My Characters' })).toHaveAttribute('aria-current', 'page')
      const radios = screen.getAllByRole('radio')
      expect(radios).toHaveLength(skinColourOptions.length)
      expect(screen.getByRole('radio', { name: 'Artist original' })).toBeChecked()
      expect(screen.getByRole('group', { name: 'Skin colour' })).toHaveAccessibleDescription(
        'Choose a preset to update every labelled skin region in the character.',
      )

      const preview = await screen.findByRole('img', { name: 'Prototype character preview' })
      expect(preview).toHaveAttribute('src', 'blob:character-1')
      expect(screen.getByText('Skin colour: Artist original')).toBeVisible()

      screen.getByRole('radio', { name: 'Artist original' }).focus()
      await user.keyboard('{ArrowRight}')
      expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
      await waitFor(() => expect(preview).toHaveAttribute('src', 'blob:character-2'))

      await user.click(screen.getByRole('radio', { name: 'Dark' }))
      expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
      await waitFor(() => expect(preview).toHaveAttribute('src', 'blob:character-3'))
      expect(screen.getByText('Skin colour: Dark')).toBeVisible()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:character-1')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:character-2')

      await waitFor(() => expect(screen.queryByText(/Checking your secure server session/)).not.toBeInTheDocument())
      await expectNoAccessibilityViolations(view.container)
      view.unmount()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:character-3')
    } finally {
      if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
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
