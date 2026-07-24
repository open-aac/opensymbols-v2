import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleUserRound } from 'lucide-react'
import { LazyMotion, domAnimation, useReducedMotion } from 'motion/react'
import * as m from 'motion/react-m'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { safeReturnTo, useAppAuth } from '../features/authentication'
import { ClerkUserControl } from '../features/clerk-user-control'
import { RouteAccessibility } from './route-accessibility'
import { BrandEndorsement, PageContainer } from './ui'
import './layout.css'

const MOBILE_NAVIGATION_QUERY = '(max-width: 800px)'

function useMobileNavigation() {
  const [mobile, setMobile] = useState(() =>
    typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_NAVIGATION_QUERY).matches)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(MOBILE_NAVIGATION_QUERY)
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return mobile
}

type DrawerPhase = 'closed' | 'open' | 'closing'

function MenuIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20">
      <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function isAuthenticationRoute(pathname: string) {
  return pathname === '/sign-in' || pathname.startsWith('/sign-in/')
    || pathname === '/sign-up' || pathname.startsWith('/sign-up/')
}

function HeaderAccountControl({ account }: { account: ReturnType<typeof useAppAuth> }) {
  const location = useLocation()

  if (!account.configured) return null
  if (!account.loaded) return <span className="header-account-slot" aria-hidden="true" />
  if (account.signedIn) {
    return <span className="header-account-slot"><ClerkUserControl /></span>
  }
  if (isAuthenticationRoute(location.pathname)) return null

  const returnTo = safeReturnTo(`${location.pathname}${location.search}${location.hash}`)
  const signInPath = `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`

  return (
    <span className="header-account-slot">
      <Link className="header-account-link" to={signInPath} aria-label="Sign in">
        <CircleUserRound aria-hidden="true" focusable="false" size={24} strokeWidth={2} />
      </Link>
    </span>
  )
}

function MobileNavigation({ account }: { account: ReturnType<typeof useAppAuth> }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(true)
  const [phase, setPhase] = useState<DrawerPhase>('closed')
  const [rtl, setRtl] = useState(false)
  const reducedMotion = useReducedMotion()
  const reducedMotionRef = useRef(reducedMotion)
  const location = useLocation()
  const active = phase !== 'closed'

  const finishClose = useCallback((restoreFocus = restoreFocusRef.current) => {
    const dialog = dialogRef.current
    if (dialog?.open) dialog.close()
    setPhase('closed')
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const requestClose = useCallback((restoreFocus = true, immediate = false) => {
    if (!dialogRef.current?.open) return
    restoreFocusRef.current = restoreFocus
    if (immediate || reducedMotionRef.current) finishClose(restoreFocus)
    else setPhase('closing')
  }, [finishClose])

  const open = () => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    setRtl(getComputedStyle(dialog).direction === 'rtl')
    restoreFocusRef.current = true
    dialog.showModal()
    setPhase('open')
    closeRef.current?.focus()
  }

  useEffect(() => {
    reducedMotionRef.current = reducedMotion
  }, [reducedMotion])

  useEffect(() => {
    if (!active) return
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousOverflow
    }
  }, [active])

  useEffect(() => {
    if (dialogRef.current?.open) requestClose(false)
  }, [location.key, requestClose])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(MOBILE_NAVIGATION_QUERY)
    const closeAtDesktop = () => {
      if (!query.matches) requestClose(false, true)
    }
    query.addEventListener('change', closeAtDesktop)
    return () => query.removeEventListener('change', closeAtDesktop)
  }, [requestClose])

  return (
    <>
      <div className="mobile-header-actions">
        <HeaderAccountControl account={account} />
        <button
          ref={triggerRef}
          className="mobile-menu-trigger"
          type="button"
          aria-controls="mobile-navigation-dialog"
          aria-expanded={active}
          aria-haspopup="dialog"
          onClick={open}
        >
          <MenuIcon />
          <span>Menu</span>
        </button>
      </div>
      <dialog
        ref={dialogRef}
        id="mobile-navigation-dialog"
        className="mobile-navigation-dialog"
        aria-labelledby="mobile-navigation-heading"
        onCancel={(event) => {
          event.preventDefault()
          requestClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            requestClose()
          }
        }}
      >
        <button
          className="mobile-navigation-backdrop"
          type="button"
          tabIndex={-1}
          aria-label="Dismiss menu"
          onClick={() => requestClose()}
        />
        <LazyMotion features={domAnimation} strict>
          <m.div
            className="mobile-navigation-panel"
            initial={false}
            animate={{ x: phase === 'open' ? 0 : rtl ? '-100%' : '100%' }}
            transition={reducedMotion
              ? { duration: 0 }
              : {
                  duration: phase === 'open' ? 0.25 : 0.2,
                  ease: [0.32, 0.72, 0, 1],
                }}
            onAnimationComplete={() => {
              if (phase === 'closing') finishClose()
            }}
          >
            <div className="mobile-navigation-panel__header">
              <h2 id="mobile-navigation-heading">Menu</h2>
              <button ref={closeRef} className="mobile-navigation-close" type="button" onClick={() => requestClose()}>
                Close menu
              </button>
            </div>
            <nav className="mobile-navigation" aria-label="Primary navigation">
              <NavLink end to="/search">Search symbols</NavLink>
              <NavLink end to="/api">API documentation</NavLink>
              {account.configured && account.loaded && account.signedIn && <Link to="/account">Your account</Link>}
            </nav>
          </m.div>
        </LazyMotion>
      </dialog>
    </>
  )
}

function useStickyHeaderOffset() {
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    function updateOffset(height: number) {
      if (height > 0) document.documentElement.style.setProperty('--site-header-height', `${height}px`)
    }

    updateOffset(header.getBoundingClientRect().height)
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver((entries) => {
        const entry = entries[0]
        updateOffset(entry?.borderBoxSize[0]?.blockSize ?? entry?.contentRect.height ?? 0)
      })
    observer?.observe(header)

    return () => {
      observer?.disconnect()
      document.documentElement.style.removeProperty('--site-header-height')
    }
  }, [])

  return headerRef
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const account = useAppAuth()
  const headerRef = useStickyHeaderOffset()
  const mobileNavigation = useMobileNavigation()

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <RouteAccessibility />
      <header className="site-header site-header--sticky" ref={headerRef}>
        <PageContainer className="site-header__inner">
          <div className="identity-lockup">
            <Link className="identity" to="/" aria-label="Open Symbols home">
              <strong>Open Symbols</strong>
            </Link>
            <BrandEndorsement
              href="https://www.openaac.org"
              brandName="OpenAAC"
              iconSrc="https://www.openaac.org/openaac.svg"
            />
          </div>
          {mobileNavigation
            ? <MobileNavigation account={account} />
            : (
                <div className="desktop-header-actions">
                  <nav className="site-navigation" aria-label="Primary navigation">
                    <NavLink end to="/search">Search symbols</NavLink>
                    <NavLink end to="/api">API documentation</NavLink>
                  </nav>
                  <HeaderAccountControl account={account} />
                </div>
              )}
        </PageContainer>
      </header>
      <main id="main" className="min-w-0" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <PageContainer>
          <p>Open Symbols is <a href="https://github.com/open-aac/opensymbols">open source</a> and powered by <a href="https://www.openaac.org">OpenAAC</a>.</p>
        </PageContainer>
      </footer>
    </div>
  )
}
