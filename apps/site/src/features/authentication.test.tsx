import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAccessibilityViolations } from '../test/axe'
import {
  AccountPage,
  AppAuthProvider,
  RequireAuthentication,
  SignInPage,
  safeReturnTo,
  type AppAuthValue,
} from './authentication'

function authValue(overrides: Partial<AppAuthValue> = {}): AppAuthValue {
  return {
    configured: true,
    loaded: true,
    signedIn: false,
    getToken: async () => null,
    signOut: async () => undefined,
    ...overrides,
  }
}

describe('account authentication', () => {
  it('accepts only safe same-origin return paths', () => {
    expect(safeReturnTo('/search?q=hello#results')).toBe('/search?q=hello#results')
    expect(safeReturnTo('https://example.com')).toBe('/account')
    expect(safeReturnTo('//example.com')).toBe('/account')
    expect(safeReturnTo('/sign-in/continue')).toBe('/account')
  })

  it('keeps public pages usable when Clerk is not configured', () => {
    const view = render(<MemoryRouter><SignInPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Account access is not configured' })).toBeVisible()
    expect(screen.getByText(/Public OpenSymbols search is still available/)).toBeVisible()
    return expectNoAccessibilityViolations(view.container)
  })

  it('redirects a signed-out visitor to sign in with a safe return path', async () => {
    render(
      <MemoryRouter initialEntries={['/account']}>
        <AppAuthProvider value={authValue()}>
          <Routes>
            <Route path="/account" element={<RequireAuthentication><p>Private account</p></RequireAuthentication>} />
            <Route path="/sign-in" element={<p>Sign-in destination</p>} />
          </Routes>
        </AppAuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Sign-in destination')).toBeVisible()
  })

  it('verifies a Clerk token with the application server and signs out', async () => {
    const user = userEvent.setup()
    const signOut = vi.fn(async () => undefined)
    const auth = authValue({
      signedIn: true,
      userId: 'user_demo',
      displayName: 'Demo Person',
      email: 'demo@example.com',
      getToken: async () => 'clerk-session-token',
      signOut,
    })
    const view = render(
      <MemoryRouter>
        <AppAuthProvider value={auth}><AccountPage /></AppAuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Demo Person' })).toBeVisible()
    expect(await screen.findByText('Your secure server session is active.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledOnce()
    await waitFor(() => expect(window.localStorage.length).toBe(0))
    expect(window.sessionStorage.length).toBe(0)
    await expectNoAccessibilityViolations(view.container)
  })
})
