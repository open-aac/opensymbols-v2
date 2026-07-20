import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectNoAccessibilityViolations } from '../test/axe'
import { AppAuthProvider, type AppAuthValue } from '../features/authentication'
import { SiteLayout } from './layout'

vi.mock('../features/clerk-user-control', () => ({
  ClerkUserControl: () => <button aria-label="Open account menu">Account avatar</button>,
}))

class HeaderResizeObserver {
  static height = 84
  observe = vi.fn(() => {
    this.callback([{
      borderBoxSize: [{ blockSize: HeaderResizeObserver.height }],
      contentRect: { height: HeaderResizeObserver.height },
    } as unknown as ResizeObserverEntry], this)
  })
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(private readonly callback: ResizeObserverCallback) {}
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--site-header-height')
})

describe('site layout', () => {
  it('keeps the shared header sticky and exposes a skip target', async () => {
    vi.stubGlobal('ResizeObserver', HeaderResizeObserver)
    const view = render(
      <MemoryRouter>
        <SiteLayout><h1>Page content</h1></SiteLayout>
      </MemoryRouter>,
    )

    expect(screen.getByRole('banner')).toHaveClass('site-header--sticky')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
    expect(document.documentElement.style.getPropertyValue('--site-header-height')).toBe('84px')
    await expectNoAccessibilityViolations(view.container)
  })

  it('updates and clears the shared scroll offset when the header resizes', () => {
    vi.stubGlobal('ResizeObserver', HeaderResizeObserver)
    const view = render(<MemoryRouter><SiteLayout><p>Content</p></SiteLayout></MemoryRouter>)
    expect(document.documentElement.style.getPropertyValue('--site-header-height')).toBe('84px')

    view.unmount()
    expect(document.documentElement.style.getPropertyValue('--site-header-height')).toBe('')
  })

  it('shows account actions separately from the legacy administrator login', () => {
    const auth: AppAuthValue = {
      configured: true,
      loaded: true,
      signedIn: false,
      getToken: async () => null,
      signOut: async () => undefined,
    }
    render(
      <MemoryRouter>
        <AppAuthProvider value={auth}>
          <SiteLayout><p>Content</p></SiteLayout>
        </AppAuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/sign-up')
    expect(screen.getByRole('link', { name: 'OpenAAC administrator sign in' })).toHaveAttribute('href', '/login')
  })

  it('shows the Clerk account control for a signed-in person without exposing a token', () => {
    const auth: AppAuthValue = {
      configured: true,
      loaded: true,
      signedIn: true,
      userId: 'user_demo',
      displayName: 'Demo Person',
      getToken: async () => 'clerk-session-token',
      signOut: async () => undefined,
    }
    render(
      <MemoryRouter>
        <AppAuthProvider value={auth}>
          <SiteLayout><p>Content</p></SiteLayout>
        </AppAuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Open account menu' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Demo Person' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('clerk-session-token')).toBeNull()
  })
})
