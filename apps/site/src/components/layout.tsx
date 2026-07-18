import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { checkSession } from '../api'
import { PageContainer } from './ui'
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

export function SiteLayout({ children }: { children: ReactNode }) {
  const session = useSession()

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <PageContainer className="site-header__inner">
          <Link className="identity" to="/" aria-label="OpenSymbols home">
            <img src="/open-symbols-mark.svg" alt="" />
            <span>
              <strong>OpenSymbols</strong>
              <small>Open communication symbols for everyone</small>
            </span>
          </Link>
          <nav className="site-navigation" aria-label="Primary navigation">
            <Link to="/search">Search symbols</Link>
            <Link to="/api">API documentation</Link>
            <a href="https://www.openaac.org">OpenAAC</a>
            {session.userName && <a href="/admin">{session.userName}</a>}
            {session.userName && <button onClick={session.logout}>Log out</button>}
          </nav>
        </PageContainer>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <PageContainer>
          <p>OpenSymbols is <a href="https://github.com/open-aac/opensymbols">open source</a> and powered by <a href="https://www.openaac.org">OpenAAC</a>.</p>
          <a className="footer-admin" href="/login">Admin sign in</a>
        </PageContainer>
      </footer>
    </div>
  )
}
