import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { getAppSession } from '../api'
import { Button, ButtonLink, CardLink, ResponsiveGrid, SectionHeading } from '../components/ui'
import { useAppAuth } from './authentication'
import './account.css'

type ServerState = 'checking' | 'verified' | 'failed'

const navigation = [
  { label: 'Overview', to: '/account', end: true },
  { label: 'My Characters', to: '/account/characters' },
  { label: 'My Symbols', to: '/account/symbols' },
  { label: 'Symbol Packs', to: '/account/packs' },
  { label: 'Settings', to: '/account/settings' },
]

const areas = {
  characters: {
    eyebrow: 'My Characters',
    title: 'Characters are coming soon',
    description: 'You will be able to build and save characters that reflect appearance, identity, culture, and mobility needs.',
  },
  symbols: {
    eyebrow: 'My Symbols',
    title: 'Personalized symbols are coming soon',
    description: 'You will be able to save symbols you personalize or compose, then find and reuse them from your library.',
  },
  packs: {
    eyebrow: 'Symbol Packs',
    title: 'Symbol packs are coming soon',
    description: 'You will be able to collect, reorder, share, and export groups of symbols for communication boards and AAC devices.',
  },
} as const

function initials(name: string | undefined) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (parts.length === 0) return 'OS'
  return `${parts[0]?.[0] ?? 'O'}${parts.length > 1 ? parts.at(-1)?.[0] ?? '' : ''}`.toUpperCase()
}

function ProfileAvatar() {
  const auth = useAppAuth()

  if (auth.imageUrl) {
    return <img className="account-profile__avatar" src={auth.imageUrl} alt="" />
  }

  return <span className="account-profile__avatar account-profile__initials" aria-hidden="true">{initials(auth.displayName)}</span>
}

function SessionNotice({ state }: { state: ServerState }) {
  if (state === 'verified') return null

  if (state === 'checking') {
    return <p className="account-session" role="status">Checking your secure server session…</p>
  }

  return (
    <p className="account-session account-session--failed" role="alert">
      Your browser session is active, but the server could not verify it. Try signing in again if this continues.
    </p>
  )
}

export function AccountLayout() {
  const auth = useAppAuth()
  const [serverState, setServerState] = useState<ServerState>('checking')

  useEffect(() => {
    let active = true
    getAppSession(auth.getToken)
      .then((session) => {
        if (active) setServerState(session.user_id === auth.userId ? 'verified' : 'failed')
      })
      .catch(() => {
        if (active) setServerState('failed')
      })
    return () => { active = false }
  }, [auth.getToken, auth.userId])

  return (
    <section className="content-page account-dashboard">
      <header className="account-profile">
        <ProfileAvatar />
        <div>
          <p className="eyebrow">Your OpenSymbols account</p>
          <h1>{auth.displayName || 'OpenSymbols user'}</h1>
          {auth.email && <p className="account-profile__email">{auth.email}</p>}
        </div>
      </header>
      <SessionNotice state={serverState} />
      <div className="account-dashboard__layout">
        <nav className="account-navigation" aria-label="Account navigation">
          {navigation.map(({ end, label, to }) => (
            <NavLink
              className={({ isActive }) => `account-navigation__link${isActive ? ' account-navigation__link--active' : ''}`}
              end={end}
              key={to}
              to={to}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="account-dashboard__content">
          <Outlet />
        </div>
      </div>
    </section>
  )
}

const dashboardAreas = [
  {
    title: 'My Characters',
    to: '/account/characters',
    description: 'Build reusable characters that can represent you, your family, or your community.',
  },
  {
    title: 'My Symbols',
    to: '/account/symbols',
    description: 'Keep the personalized and composed communication symbols that matter to you.',
  },
  {
    title: 'Symbol Packs',
    to: '/account/packs',
    description: 'Organize symbols into practical sets for boards, lessons, and everyday communication.',
  },
]

export function AccountOverviewPage() {
  return (
    <div className="account-section">
      <SectionHeading
        title="Your dashboard"
        description="This will be your home for creating and organizing personalized communication symbols."
        action={<ButtonLink to="/search" variant="primary">Explore symbols</ButtonLink>}
      />
      <ResponsiveGrid className="account-area-grid">
        {dashboardAreas.map((area) => (
          <CardLink className="account-area-card" key={area.to} to={area.to}>
            <span className="account-badge">Coming soon</span>
            <h3>{area.title}</h3>
            <p>{area.description}</p>
            <span className="account-area-card__link">View area <span aria-hidden="true">→</span></span>
          </CardLink>
        ))}
      </ResponsiveGrid>
    </div>
  )
}

export function AccountAreaPage({ area }: { area: keyof typeof areas }) {
  const content = areas[area]

  return (
    <div className="account-section account-empty-state">
      <p className="eyebrow">{content.eyebrow}</p>
      <span className="account-badge">Coming soon</span>
      <h2>{content.title}</h2>
      <p>{content.description}</p>
      <ButtonLink to="/search">Explore the public symbol library</ButtonLink>
    </div>
  )
}

export function AccountSettingsPage() {
  const auth = useAppAuth()

  return (
    <div className="account-section">
      <SectionHeading
        title="Account settings"
        description="Your identity and sign-in security are managed securely by Clerk."
      />
      <div className="account-settings-card">
        <div className="account-settings-card__identity">
          <ProfileAvatar />
          <div>
            <h3>{auth.displayName || 'OpenSymbols user'}</h3>
            {auth.email && <p>{auth.email}</p>}
          </div>
        </div>
        <div className="account-settings-card__actions">
          <Button variant="primary" onClick={auth.manageAccount}>Manage account</Button>
          <Button onClick={() => void auth.signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  )
}
