import {
  SignIn,
  SignUp,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/react-router'
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { PageSection, StatusMessage } from '../components/ui'
import './authentication.css'

export interface AppAuthValue {
  configured: boolean
  loaded: boolean
  signedIn: boolean
  userId?: string
  displayName?: string
  email?: string
  imageUrl?: string
  getToken(): Promise<string | null>
  manageAccount(): void
  signOut(): Promise<void>
}

const unavailableAuth: AppAuthValue = {
  configured: false,
  loaded: true,
  signedIn: false,
  getToken: async () => null,
  manageAccount: () => undefined,
  signOut: async () => undefined,
}

const AppAuthContext = createContext<AppAuthValue>(unavailableAuth)

export function AppAuthProvider({
  value,
  children,
}: {
  value: AppAuthValue
  children: ReactNode
}) {
  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>
}

export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { openUserProfile, signOut } = useClerk()
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress
  const displayName = user?.fullName || user?.firstName || email || 'Open Symbols user'
  const value = useMemo<AppAuthValue>(() => ({
    configured: true,
    loaded: auth.isLoaded,
    signedIn: Boolean(auth.isSignedIn && auth.userId),
    userId: auth.userId ?? undefined,
    displayName,
    email,
    imageUrl: user?.imageUrl,
    getToken: () => auth.getToken(),
    manageAccount: () => openUserProfile(),
    signOut: async () => { await signOut({ redirectUrl: '/' }) },
  }), [auth, displayName, email, openUserProfile, signOut, user?.imageUrl])

  return <AppAuthProvider value={value}>{children}</AppAuthProvider>
}

export function useAppAuth() {
  return useContext(AppAuthContext)
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account'

  try {
    const parsed = new URL(value, 'https://opensymbols.local')
    if (parsed.origin !== 'https://opensymbols.local') return '/account'
    if (parsed.pathname.startsWith('/sign-in') || parsed.pathname.startsWith('/sign-up')) {
      return '/account'
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/account'
  }
}

function returnToFromLocation(search: string) {
  return safeReturnTo(new URLSearchParams(search).get('redirect_url'))
}

function AuthenticationUnavailable() {
  return (
    <PageSection className="auth-page">
      <p className="eyebrow">Account access</p>
      <h1>Account access is not configured</h1>
      <p>
        Public Open Symbols search is still available. This environment needs a Clerk development key before
        accounts can be created or used.
      </p>
    </PageSection>
  )
}

const clerkAppearance = {
  variables: {
    colorPrimary: '#087f73',
    colorText: '#17242b',
    colorBackground: '#ffffff',
    borderRadius: '0.75rem',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  elements: {
    formButtonPrimary: { minHeight: '44px' },
    formFieldInput: { minHeight: '44px' },
    footerActionLink: { minHeight: '44px', display: 'inline-flex', alignItems: 'center' },
  },
} as const

export function SignInPage() {
  const auth = useAppAuth()
  const location = useLocation()
  const returnTo = returnToFromLocation(location.search)

  if (!auth.configured) return <AuthenticationUnavailable />
  if (auth.loaded && auth.signedIn) return <Navigate replace to={returnTo} />

  return (
    <PageSection className="auth-page">
      <p className="eyebrow">Your Open Symbols account</p>
      <h1>Sign in</h1>
      <p>Sign in to access the account area and, in later phases, save personalized communication symbols.</p>
      <div className="auth-component">
        <SignIn
          appearance={clerkAppearance}
          fallbackRedirectUrl={returnTo}
          path="/sign-in"
          routing="path"
          signUpFallbackRedirectUrl={returnTo}
          signUpUrl={`/sign-up?redirect_url=${encodeURIComponent(returnTo)}`}
        />
      </div>
    </PageSection>
  )
}

export function SignUpPage() {
  const auth = useAppAuth()
  const location = useLocation()
  const returnTo = returnToFromLocation(location.search)

  if (!auth.configured) return <AuthenticationUnavailable />
  if (auth.loaded && auth.signedIn) return <Navigate replace to={returnTo} />

  return (
    <PageSection className="auth-page">
      <p className="eyebrow">Your Open Symbols account</p>
      <h1>Create an account</h1>
      <p>Create an account with a verified email address. Public search and downloads do not require an account.</p>
      <div className="auth-component">
        <SignUp
          appearance={clerkAppearance}
          fallbackRedirectUrl={returnTo}
          path="/sign-up"
          routing="path"
          signInFallbackRedirectUrl={returnTo}
          signInUrl={`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`}
        />
      </div>
    </PageSection>
  )
}

export function RequireAuthentication({ children }: { children: ReactNode }) {
  const auth = useAppAuth()
  const location = useLocation()

  if (!auth.configured) return <AuthenticationUnavailable />
  if (!auth.loaded) {
    return <PageSection><StatusMessage status="status">Checking your account…</StatusMessage></PageSection>
  }
  if (!auth.signedIn) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    return <Navigate replace to={`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`} />
  }

  return children
}
