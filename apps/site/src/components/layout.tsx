import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { checkSession } from '../api'
import { useAppAuth } from '../features/authentication'
import { ClerkUserControl } from '../features/clerk-user-control'
import { BrandEndorsement, PageContainer } from './ui'
import './layout.css'

function useSession() {
  const [userName, setUserName] = useState<string>()

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    checkSession(token)
      .then((session) => {
        if (!session.valid) throw new Error('Invalid session')
        const refreshedToken = session.refresh_token || token
        setUserName(session.user_name || 'User')
        localStorage.setItem('auth_token', refreshedToken)
        document.cookie = `auth=${refreshedToken};path=/;SameSite=Lax`
      })
      .catch(() => {
        localStorage.removeItem('auth_token')
        document.cookie = 'auth=;path=/;max-age=0;SameSite=Lax'
      })
  }, [])

  return {
    userName,
    logout() {
      localStorage.removeItem('auth_token')
      document.cookie = 'auth=;path=/;max-age=0;SameSite=Lax'
      window.location.assign('/')
    },
  }
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
  const adminSession = useSession()
  const account = useAppAuth()
  const headerRef = useStickyHeaderOffset()

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header site-header--sticky" ref={headerRef}>
        <PageContainer className="site-header__inner">
          <div className="identity-lockup">
            <Link className="identity" to="/" aria-label="Open Symbols home">
              <img src="/open-symbols-mark.svg" alt="" />
              <strong>Open Symbols</strong>
            </Link>
            <BrandEndorsement
              href="https://www.openaac.org"
              brandName="OpenAAC"
              iconSrc="https://www.openaac.org/openaac.svg"
            />
          </div>
          <nav className="site-navigation" aria-label="Primary navigation">
            <Link to="/search">Search symbols</Link>
            <Link to="/api">API documentation</Link>
            {account.configured && account.loaded && !account.signedIn && <Link to="/sign-in">Sign in</Link>}
            {account.configured && account.loaded && !account.signedIn && <Link to="/sign-up">Create account</Link>}
            {account.configured && account.loaded && account.signedIn && <ClerkUserControl />}
            {adminSession.userName && <a href="/admin">Admin: {adminSession.userName}</a>}
            {adminSession.userName && <button onClick={adminSession.logout}>Admin log out</button>}
          </nav>
        </PageContainer>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <PageContainer>
          <p>Open Symbols is <a href="https://github.com/open-aac/opensymbols">open source</a> and powered by <a href="https://www.openaac.org">OpenAAC</a>.</p>
          <a className="footer-admin" href="/login">OpenAAC administrator sign in</a>
        </PageContainer>
      </footer>
    </div>
  )
}
