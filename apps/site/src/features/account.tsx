import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { getAppSession } from '../api'
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  CardLink,
  EmptyState,
  FormActions,
  PageSection,
  ResponsiveGrid,
  SectionHeading,
  StatusMessage,
  Surface,
} from '../components/ui'
import { useAppAuth } from './authentication'
import './account.css'

type ServerSessionState =
  | { status: 'checking'; userId?: string }
  | { status: 'failed'; userId?: string }
  | { status: 'verified'; userId?: string; administrator: boolean }

const navigation = [
  { label: 'Overview', to: '/account', end: true },
  { label: 'My Characters', to: '/account/characters' },
  { label: 'My Symbols', to: '/account/symbols' },
  { label: 'Symbol Packs', to: '/account/packs' },
  { label: 'Settings', to: '/account/settings' },
]

const areas = {
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

function ProfileAvatar() {
  const auth = useAppAuth()
  return <Avatar className="account-profile__avatar" imageUrl={auth.imageUrl} name={auth.displayName} />
}

function useServerSession(): ServerSessionState {
  const auth = useAppAuth()
  const [resolvedState, setResolvedState] = useState<ServerSessionState>({
    status: 'checking',
    userId: auth.userId,
  })

  useEffect(() => {
    let active = true
    getAppSession(auth.getToken)
      .then((session) => {
        if (!active) return
        setResolvedState(session.user_id === auth.userId
          ? { status: 'verified', userId: auth.userId, administrator: session.administrator === true }
          : { status: 'failed', userId: auth.userId })
      })
      .catch(() => {
        if (active) setResolvedState({ status: 'failed', userId: auth.userId })
      })
    return () => { active = false }
  }, [auth.getToken, auth.userId])

  return resolvedState.userId === auth.userId
    ? resolvedState
    : { status: 'checking' as const, userId: auth.userId }
}

function SessionNotice({ state }: { state: ServerSessionState }) {
  if (state.status === 'verified') return null

  if (state.status === 'checking') {
    return <StatusMessage className="account-session" status="status">Checking your secure server session…</StatusMessage>
  }

  return (
    <StatusMessage className="account-session" status="alert">
      Your browser session is active, but the server could not verify it. Try signing in again if this continues.
    </StatusMessage>
  )
}

export function AccountLayout() {
  const auth = useAppAuth()
  const serverState = useServerSession()

  return (
    <PageSection className="account-dashboard">
      <header className="account-profile">
        <ProfileAvatar />
        <div>
          <p className="eyebrow">Your Open Symbols account</p>
          <h1>{auth.displayName || 'Open Symbols user'}</h1>
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
          {serverState.status === 'verified' && serverState.administrator && (
            <NavLink
              className={({ isActive }) => `account-navigation__link${isActive ? ' account-navigation__link--active' : ''}`}
              to="/admin"
            >
              Administrator
            </NavLink>
          )}
        </nav>
        <Surface className="account-dashboard__content min-w-0">
          <Outlet />
        </Surface>
      </div>
    </PageSection>
  )
}

export function RequireAdministrator({ children }: { children: ReactNode }) {
  const state = useServerSession()

  if (state.status === 'checking') {
    return <PageSection><StatusMessage status="status">Checking administrator access…</StatusMessage></PageSection>
  }
  if (state.status === 'failed') {
    return (
      <PageSection>
        <StatusMessage status="alert">
          Administrator access could not be verified. Try signing in again if this continues.
        </StatusMessage>
      </PageSection>
    )
  }
  if (!state.administrator) {
    return (
      <PageSection className="account-section">
        <p className="eyebrow">Administrator access</p>
        <h1>Administrator access required</h1>
        <p>Your account does not have permission to use Open Symbols administrator tools.</p>
        <ButtonLink to="/account">Return to your account</ButtonLink>
      </PageSection>
    )
  }

  return children
}

export function AdministratorPage() {
  return (
    <PageSection className="account-section">
      <p className="eyebrow">Open Symbols administration</p>
      <h1>Administrator tools</h1>
      <EmptyState
        heading="Library imports are coming next"
        description="Your administrator access is verified. Upload and review tools will appear here in the next implementation stage."
        action={<ButtonLink to="/account">Return to your account</ButtonLink>}
      />
    </PageSection>
  )
}

const dashboardAreas = [
  {
    title: 'My Characters',
    to: '/account/characters',
    description: 'Build reusable characters that can represent you, your family, or your community.',
    status: 'Prototype',
  },
  {
    title: 'My Symbols',
    to: '/account/symbols',
    description: 'Keep the personalized and composed communication symbols that matter to you.',
    status: 'Coming soon',
  },
  {
    title: 'Symbol Packs',
    to: '/account/packs',
    description: 'Organize symbols into practical sets for boards, lessons, and everyday communication.',
    status: 'Coming soon',
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
            <Badge>{area.status}</Badge>
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
    <EmptyState
      className="account-section account-empty-state"
      eyebrow={content.eyebrow}
      badge={<Badge>Coming soon</Badge>}
      heading={content.title}
      description={content.description}
      action={<ButtonLink to="/search">Explore the public symbol library</ButtonLink>}
    />
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
      <Surface className="account-settings-card" tone="muted">
        <div className="account-settings-card__identity">
          <ProfileAvatar />
          <div>
            <h3>{auth.displayName || 'Open Symbols user'}</h3>
            {auth.email && <p>{auth.email}</p>}
          </div>
        </div>
        <FormActions className="account-settings-card__actions">
          <Button variant="primary" onClick={auth.manageAccount}>Manage account</Button>
          <Button onClick={() => void auth.signOut()}>Sign out</Button>
        </FormActions>
      </Surface>
    </div>
  )
}
