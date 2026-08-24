import { http, HttpResponse } from 'msw'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { developmentDefaultIdentity } from '@opensymbols/avatar-svg'
import { expectNoAccessibilityViolations } from '../test/axe'
import { server } from '../test/server'
import { AppAuthProvider, type AppAuthValue } from './authentication'
import {
  AccountAreaPage,
  AccountLayout,
  AccountOverviewPage,
  AccountSettingsPage,
} from './account'
import { CharacterEditorPage, CharacterLibraryPage } from './character-builder'

function characterRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Sam',
    template_key: 'modular-svg-avatar',
    template_version: 1,
    configuration_version: 1,
    identity: structuredClone(developmentDefaultIdentity),
    revision: 1,
    created_at: '2026-08-03T12:00:00.000Z',
    updated_at: '2026-08-03T13:00:00.000Z',
    ...overrides,
  }
}

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
          <Route path="/account/characters/new" element={<CharacterEditorPage />} />
          <Route path="/account/characters/:characterId/edit" element={<CharacterEditorPage />} />
          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<AccountOverviewPage />} />
            <Route path="characters" element={<CharacterLibraryPage />} />
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

  it('presents My Characters as an empty library with one clear creation action', async () => {
    const view = renderAccount('/account/characters')

    expect(screen.getByRole('heading', { name: 'My characters' })).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'No characters yet' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'New character' })).toHaveAttribute('href', '/account/characters/new')
    expect(screen.getAllByRole('link', { name: 'New character' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'My Characters' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.queryByText(/Checking your secure server session/)).not.toBeInTheDocument())
    await expectNoAccessibilityViolations(view.container)
  })

  it('offers an accessible modular editor with identity choices, undo, and save', async () => {
    const user = userEvent.setup()
    const saved = characterRecord({
      identity: {
        ...structuredClone(developmentDefaultIdentity),
        selections: {
          ...developmentDefaultIdentity.selections,
          body: 'body-broad',
          rearHair: 'hair-coily-rear',
          frontHair: 'hair-coily-front',
        },
        colours: { ...developmentDefaultIdentity.colours, skin: 'skin-deep' },
      },
    })
    const createRequest = vi.fn()
    server.use(
      http.post('/api/app/characters', async ({ request }) => {
        createRequest(await request.json())
        return HttpResponse.json({ character: saved }, { status: 201 })
      }),
      http.get('/api/app/characters/:id', () => HttpResponse.json({ character: saved })),
    )
    const view = renderAccount('/account/characters/new')

    expect(screen.getByRole('heading', { name: 'New character' })).toHaveClass('visually-hidden')
    expect(screen.getByText('Development art')).toBeVisible()
    expect(screen.getByText(/not approved artwork/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save character' })).toBeDisabled()
    expect(screen.queryByText('Enter a character name between 1 and 80 characters.')).not.toBeInTheDocument()

    let nameInput = screen.getByRole('textbox', { name: 'Character name' })
    expect(nameInput).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    nameInput = screen.getByRole('textbox', { name: 'Character name' })

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Starting character',
      'Face & skin',
      'Hair',
      'Body & clothing',
      'Accessories',
      'Equipment',
    ])
    expect(screen.getByRole('tab', { name: 'Starting character' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('radio', { name: 'Average' })).toBeChecked()
    expect(screen.getByRole('img', { name: 'New character preview' })).toBeVisible()

    await user.click(screen.getByRole('radio', { name: 'Broad' }))
    expect(screen.getByText(/Broad build/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()

    const startingTab = screen.getByRole('tab', { name: 'Starting character' })
    startingTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Face & skin' })).toHaveFocus()
    await user.click(screen.getByRole('radio', { name: 'Deep' }))

    await user.click(screen.getByRole('tab', { name: 'Hair' }))
    await user.click(screen.getByRole('radio', { name: 'Coily' }))
    expect(screen.getByText(/Coily hair/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reset category' }))
    expect(screen.getByText(/Short hair/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText(/Coily hair/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reset all' }))
    expect(screen.getByText(/Average build.*Short hair.*Medium skin tone/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText(/Broad build.*Coily hair.*Deep skin tone/)).toBeVisible()

    for (const tab of tabs) {
      await user.click(tab)
      await expectNoAccessibilityViolations(view.container)
    }

    await user.type(nameInput, 'Sam')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Save character' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save character' }))
    await waitFor(() => expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Sam',
      template_key: 'modular-svg-avatar',
      identity: expect.objectContaining({
        selections: expect.objectContaining({
          body: 'body-broad',
          rearHair: 'hair-coily-rear',
          frontHair: 'hair-coily-front',
        }),
        colours: expect.objectContaining({ skin: 'skin-deep' }),
      }),
    })))
    expect(await screen.findByRole('heading', { name: 'Edit character' })).toBeInTheDocument()
    expect(screen.getByText('Character saved.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save character' })).toBeDisabled()
  })

  it('lists owned characters and deletes one through a named confirmation dialog', async () => {
    const user = userEvent.setup()
    const character = characterRecord()
    const deleted = vi.fn()
    server.use(
      http.get('/api/app/characters', () => HttpResponse.json({ characters: [character] })),
      http.delete('/api/app/characters/:id', () => { deleted(); return new HttpResponse(null, { status: 204 }) }),
    )
    const view = renderAccount('/account/characters')

    expect(await screen.findByRole('heading', { name: 'Sam' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Sam preview' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/account/characters/10000000-0000-4000-8000-000000000001/edit',
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete Sam?')
    await expectNoAccessibilityViolations(view.container)
    await user.click(screen.getByRole('button', { name: 'Delete character' }))
    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    expect(screen.queryByRole('heading', { name: 'Sam' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New character' })).toHaveFocus()
  })

  it('protects dirty editor changes when Exit is cancelled', async () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    const user = userEvent.setup()
    renderAccount('/account/characters/new')

    await user.type(screen.getByRole('textbox', { name: 'Character name' }), 'Unsaved')
    await user.click(screen.getByRole('button', { name: 'Exit editor' }))
    expect(confirm).toHaveBeenCalledWith('Leave the character editor? Your unsaved changes will be lost.')
    expect(screen.getByRole('heading', { name: 'New character' })).toBeInTheDocument()

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
  })

  it('edits a saved character name inline with keyboard apply and cancellation', async () => {
    const user = userEvent.setup()
    const saved = characterRecord()
    server.use(http.get('/api/app/characters/:id', () => HttpResponse.json({ character: saved })))
    const view = renderAccount(`/account/characters/${saved.id}/edit`)

    expect(await screen.findByText('Sam')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    const nameInput = screen.getByRole('textbox', { name: 'Character name' })
    expect(nameInput).toHaveFocus()
    await user.clear(nameInput)
    await user.type(nameInput, '  Alex  {Enter}')
    expect(screen.getByText('Alex')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Edit name' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Save character' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    await user.clear(screen.getByRole('textbox', { name: 'Character name' }))
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save character' })).toBeDisabled()
    await expectNoAccessibilityViolations(view.container)
    await user.keyboard('{Escape}')
    expect(screen.getByText('Alex')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Edit name' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    await user.clear(screen.getByRole('textbox', { name: 'Character name' }))
    await user.type(screen.getByRole('textbox', { name: 'Character name' }), 'Discard me')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Alex')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Edit name' })).toHaveFocus()
  })

  it('keeps local edits after a revision conflict and reloads the saved version explicitly', async () => {
    const user = userEvent.setup()
    const original = characterRecord()
    const changed = { ...original, name: 'Sam from another tab', revision: 2, updated_at: '2026-08-03T14:00:00.000Z' }
    let reads = 0
    server.use(
      http.get('/api/app/characters/:id', () => HttpResponse.json({ character: reads++ ? changed : original })),
      http.patch('/api/app/characters/:id', () => HttpResponse.json({ error: 'character_conflict' }, { status: 409 })),
    )
    const view = renderAccount(`/account/characters/${original.id}/edit`)

    expect(await screen.findByText('Sam')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Edit name' }))
    const name = screen.getByRole('textbox', { name: 'Character name' })
    await user.clear(name)
    await user.type(name, 'My local edit')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Save character' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This character changed elsewhere')
    expect(screen.getByText('My local edit')).toBeVisible()
    await expectNoAccessibilityViolations(view.container)

    await user.click(screen.getByRole('button', { name: 'Reload saved character' }))
    await waitFor(() => expect(screen.getByText('Sam from another tab')).toBeVisible())
    expect(screen.getByRole('button', { name: 'Save character' })).toBeDisabled()
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
