import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--site-header-height')
  document.documentElement.style.overflow = ''
  document.documentElement.dir = ''
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function stubMobileViewport({ reducedMotion = true } = {}) {
  let mobile = true
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>()
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    const queryListeners = listeners.get(query) ?? new Set()
    listeners.set(query, queryListeners)
    const result = {
      media: query,
      get matches() {
        return query === '(max-width: 800px)' ? mobile : reducedMotion
      },
      onchange: null,
      addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => queryListeners.add(listener),
      removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => queryListeners.delete(listener),
      addListener: (listener: (event: MediaQueryListEvent) => void) => queryListeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => queryListeners.delete(listener),
      dispatchEvent: () => true,
    }
    return result as MediaQueryList
  }))
  return {
    desktop() {
      mobile = false
      for (const listener of listeners.get('(max-width: 800px)') ?? []) {
        listener({ matches: false, media: '(max-width: 800px)' } as MediaQueryListEvent)
      }
    },
  }
}

function mockDialog() {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    } },
    close: { configurable: true, value(this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    } },
  })
}

const signedOut: AppAuthValue = {
  configured: true,
  loaded: true,
  signedIn: false,
  getToken: async () => null,
  manageAccount: () => undefined,
  signOut: async () => undefined,
}

const signedIn: AppAuthValue = {
  ...signedOut,
  signedIn: true,
  userId: 'user_demo',
  displayName: 'Demo Person',
  getToken: async () => 'clerk-session-token',
}

function LocationPath() {
  return <span data-testid="location">{useLocation().pathname}</span>
}

describe('site layout', () => {
  it('keeps the shared header sticky and exposes a skip target', async () => {
    vi.stubGlobal('ResizeObserver', HeaderResizeObserver)
    const view = render(
      <MemoryRouter>
        <SiteLayout><h1>Page content</h1></SiteLayout>
      </MemoryRouter>,
    )

    expect(screen.getByRole('banner')).toHaveClass('site-header--sticky')
    expect(screen.getByRole('link', { name: 'Open Symbols home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('banner')).toHaveTextContent('Open Symbols')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Open Symbols is open source')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('main')).toHaveClass('min-w-0')
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

  it('presents OpenAAC as a linked endorsement outside primary navigation', () => {
    render(<MemoryRouter><SiteLayout><p>Content</p></SiteLayout></MemoryRouter>)

    const homeLink = screen.getByRole('link', { name: 'Open Symbols home' })
    const endorsementLink = screen.getByRole('link', { name: 'by OpenAAC' })
    const badge = endorsementLink.querySelector('img')
    const navigation = within(screen.getByRole('navigation', { name: 'Primary navigation' }))

    expect(homeLink.querySelector('img')).not.toBeInTheDocument()
    expect(endorsementLink).toHaveAttribute('href', 'https://www.openaac.org')
    expect(endorsementLink).toHaveTextContent('by')
    expect(endorsementLink).not.toHaveTextContent('-')
    expect(endorsementLink.parentElement).toBe(homeLink.parentElement)
    expect(badge).toHaveAttribute('src', 'https://www.openaac.org/openaac.svg')
    expect(badge).toHaveAttribute('alt', '')
    expect(badge).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(navigation.queryByRole('link', { name: 'OpenAAC' })).not.toBeInTheDocument()
    expect(navigation.getByRole('link', { name: 'Search symbols' })).toHaveAttribute('href', '/search')
    expect(navigation.getByRole('link', { name: 'API documentation' })).toHaveAttribute('href', '/api')
    expect(screen.queryByText('Open communication symbols for everyone')).not.toBeInTheDocument()
  })

  it('keeps the OpenAAC endorsement usable when its remote badge fails', () => {
    render(<MemoryRouter><SiteLayout><p>Content</p></SiteLayout></MemoryRouter>)

    const endorsementLink = screen.getByRole('link', { name: 'by OpenAAC' })
    const badge = endorsementLink.querySelector('img')
    expect(badge).not.toBeNull()

    fireEvent.error(badge!)

    expect(endorsementLink.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'by OpenAAC' })).toHaveAttribute('href', 'https://www.openaac.org')
  })

  it('shows one signed-out account icon outside primary navigation and preserves the current location', async () => {
    const auth: AppAuthValue = {
      configured: true,
      loaded: true,
      signedIn: false,
      getToken: async () => null,
      manageAccount: () => undefined,
      signOut: async () => undefined,
    }
    render(
      <MemoryRouter initialEntries={['/search?q=hello#results']}>
        <AppAuthProvider value={auth}>
          <SiteLayout><p>Content</p></SiteLayout>
        </AppAuthProvider>
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
    const signIn = screen.getByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', '/sign-in?redirect_url=%2Fsearch%3Fq%3Dhello%23results')
    expect(navigation).not.toContainElement(signIn)
    expect(within(navigation).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument()
    expect(signIn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('link', { name: 'OpenAAC administrator sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Admin log out' })).not.toBeInTheDocument()
    await expectNoAccessibilityViolations(signIn.closest('header')!)
  })

  it.each(['/sign-in', '/sign-in/continue', '/sign-up', '/sign-up/continue'])(
    'hides the signed-out account icon on %s',
    (route) => {
      render(
        <MemoryRouter initialEntries={[route]}>
          <AppAuthProvider value={signedOut}><SiteLayout><p>Content</p></SiteLayout></AppAuthProvider>
        </MemoryRouter>,
      )

      expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    },
  )

  it('does not inspect or refresh legacy administrator tokens', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    window.localStorage.setItem('auth_token', 'legacy-token')

    render(<MemoryRouter><SiteLayout><p>Content</p></SiteLayout></MemoryRouter>)

    expect(fetch).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('auth_token')).toBe('legacy-token')
  })

  it('shows the Clerk account control for a signed-in person without exposing a token', () => {
    const auth: AppAuthValue = {
      configured: true,
      loaded: true,
      signedIn: true,
      userId: 'user_demo',
      displayName: 'Demo Person',
      getToken: async () => 'clerk-session-token',
      manageAccount: () => undefined,
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
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Demo Person' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('clerk-session-token')).toBeNull()
  })

  it('opens an accessible mobile navigation dialog without signed-out actions', async () => {
    stubMobileViewport()
    mockDialog()
    const user = userEvent.setup()
    const view = render(
      <MemoryRouter>
        <AppAuthProvider value={signedOut}>
          <SiteLayout><p>Content</p></SiteLayout>
        </AppAuthProvider>
      </MemoryRouter>,
    )

    const trigger = screen.getByRole('button', { name: 'Menu' })
    const signIn = screen.getByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', '/sign-in?redirect_url=%2F')
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).not.toBeInTheDocument()

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Menu' })
    const navigation = within(dialog).getByRole('navigation', { name: 'Primary navigation' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(navigation).getByRole('link', { name: 'Search symbols' })).toHaveAttribute('href', '/search')
    expect(within(navigation).getByRole('link', { name: 'API documentation' })).toHaveAttribute('href', '/api')
    expect(within(navigation).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(within(navigation).queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument()
    expect(navigation).not.toContainElement(signIn)
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()
    expect(document.documentElement.style.overflow).toBe('hidden')
    await expectNoAccessibilityViolations(view.container)
  })

  it('closes from the button, Escape request, and backdrop and restores trigger focus', async () => {
    stubMobileViewport()
    mockDialog()
    const user = userEvent.setup()
    render(<MemoryRouter><SiteLayout><p>Content</p></SiteLayout></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: 'Menu' })

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Menu' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    await user.click(document.querySelector('.mobile-navigation-backdrop') as HTMLElement)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('closes on navigation and renders the signed-in account choices in their intended places', async () => {
    stubMobileViewport()
    mockDialog()
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppAuthProvider value={signedIn}>
          <SiteLayout>
            <Routes>
              <Route path="*" element={<LocationPath />} />
            </Routes>
          </SiteLayout>
        </AppAuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Open account menu' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(navigation).getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/account')
    expect(within(navigation).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()

    await user.click(within(navigation).getByRole('link', { name: 'Search symbols' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/search')
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes immediately at the desktop breakpoint and cleans up scroll locking', async () => {
    const viewport = stubMobileViewport()
    mockDialog()
    const user = userEvent.setup()
    render(<MemoryRouter><SiteLayout><p>Content</p></SiteLayout></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(document.documentElement.style.overflow).toBe('hidden')
    viewport.desktop()

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument())
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it.each([
    ['loading', { ...signedOut, loaded: false }],
    ['unconfigured', { ...signedOut, configured: false }],
  ] as const)('does not expose unavailable account actions while authentication is %s', async (state, auth) => {
    stubMobileViewport()
    mockDialog()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AppAuthProvider value={auth}><SiteLayout><p>Content</p></SiteLayout></AppAuthProvider>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(navigation).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(within(navigation).queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument()
    expect(within(navigation).queryByRole('link', { name: 'Your account' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('.header-account-slot')).toHaveLength(state === 'loading' ? 1 : 0)
  })
})
