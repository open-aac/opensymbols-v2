import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/react-router'
import { App } from './App'
import { ClerkAuthBridge } from './features/authentication'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()

function RootApplication() {
  const application = publishableKey
    ? (
        <ClerkProvider
          afterSignOutUrl="/"
          publishableKey={publishableKey}
          signInFallbackRedirectUrl="/account"
          signInUrl="/sign-in"
          signUpFallbackRedirectUrl="/account"
          signUpUrl="/sign-up"
        >
          <ClerkAuthBridge><App /></ClerkAuthBridge>
        </ClerkProvider>
      )
    : <App />

  return <BrowserRouter>{application}</BrowserRouter>
}

createRoot(root).render(<StrictMode><RootApplication /></StrictMode>)
