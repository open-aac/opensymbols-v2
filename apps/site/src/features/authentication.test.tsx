import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { expectNoAccessibilityViolations } from '../test/axe'
import {
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
    manageAccount: () => undefined,
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

  it('redirects a signed-out visitor to sign in with the nested account return path', async () => {
    function SignInDestination() {
      const location = useLocation()
      return <p>Sign-in destination: {location.search}</p>
    }

    render(
      <MemoryRouter initialEntries={['/account/symbols?view=saved#library']}>
        <AppAuthProvider value={authValue()}>
          <Routes>
            <Route path="/account/*" element={<RequireAuthentication><p>Private account</p></RequireAuthentication>} />
            <Route path="/sign-in" element={<SignInDestination />} />
          </Routes>
        </AppAuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Sign-in destination/)).toHaveTextContent(
      'redirect_url=%2Faccount%2Fsymbols%3Fview%3Dsaved%23library',
    )
  })
})
