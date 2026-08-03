import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { formatPageTitle } from './page-title'

function routeMetadata(pathname: string, search: string) {
  if (pathname === '/') {
    return { title: formatPageTitle('Open Symbols'), announcement: 'Home page loaded' }
  }

  if (pathname === '/search') {
    const query = new URLSearchParams(search).get('q')?.trim()
    return {
      title: formatPageTitle(query ? `Search “${query}”` : 'Search symbols'),
      announcement: 'Search page loaded',
    }
  }

  if (pathname === '/api') {
    return { title: formatPageTitle('API documentation'), announcement: 'API documentation page loaded' }
  }

  if (pathname === '/sign-in' || pathname.startsWith('/sign-in/')) {
    return { title: formatPageTitle('Sign in'), announcement: 'Sign in page loaded' }
  }

  if (pathname === '/sign-up' || pathname.startsWith('/sign-up/')) {
    return { title: formatPageTitle('Create an account'), announcement: 'Create an account page loaded' }
  }

  const accountPages: Record<string, string> = {
    '/account': 'Your dashboard',
    '/account/characters': 'My Characters',
    '/account/characters/new': 'New character',
    '/account/symbols': 'My Symbols',
    '/account/packs': 'Symbol Packs',
    '/account/settings': 'Account settings',
  }
  const accountTitle = accountPages[pathname]
  if (accountTitle) {
    return { title: formatPageTitle(accountTitle), announcement: `${accountTitle} page loaded` }
  }

  if (/^\/account\/characters\/[^/]+\/edit$/.test(pathname)) {
    return { title: formatPageTitle('Edit character'), announcement: 'Edit character page loaded' }
  }

  if (pathname.startsWith('/repositories/')) {
    return { title: formatPageTitle('Repository'), announcement: 'Repository page loaded' }
  }

  if (pathname.startsWith('/symbols/')) {
    return { title: formatPageTitle('Symbol'), announcement: 'Symbol page loaded' }
  }

  return { title: formatPageTitle('Page not found'), announcement: 'Page not found' }
}

export function RouteAccessibility() {
  const location = useLocation()
  const routeKey = `${location.pathname}${location.search}`
  const previousRouteRef = useRef<string | undefined>(undefined)
  const announcementIdRef = useRef(0)
  const [announcement, setAnnouncement] = useState<{ id: number; message: string }>()
  const metadata = routeMetadata(location.pathname, location.search)

  useEffect(() => {
    document.title = metadata.title

    const previousRoute = previousRouteRef.current
    previousRouteRef.current = routeKey
    if (previousRoute === undefined || previousRoute === routeKey) return

    const completeTransition = () => {
      document.getElementById('main')?.focus({ preventScroll: true })
      window.scrollTo(0, 0)
      announcementIdRef.current += 1
      setAnnouncement({ id: announcementIdRef.current, message: metadata.announcement })
    }
    const mobileDialog = document.getElementById('mobile-navigation-dialog') as HTMLDialogElement | null

    if (mobileDialog?.open) {
      mobileDialog.addEventListener('close', completeTransition, { once: true })
      return () => mobileDialog.removeEventListener('close', completeTransition)
    }

    completeTransition()
  }, [metadata.announcement, metadata.title, routeKey])

  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {announcement && <span key={announcement.id}>{announcement.message}</span>}
    </div>
  )
}
