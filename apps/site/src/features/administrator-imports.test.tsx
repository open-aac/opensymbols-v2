import { http, HttpResponse } from 'msw'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { expectNoAccessibilityViolations } from '../test/axe'
import { server } from '../test/server'
import { AppAuthProvider, type AppAuthValue } from './authentication'
import { AdministratorImportDetailPage, AdministratorImportsPage, NewAdministratorImportPage } from './administrator-imports'

const auth: AppAuthValue = {
  configured: true, loaded: true, signedIn: true, userId: 'admin_one', displayName: 'Admin',
  getToken: async () => 'clerk-session-token', manageAccount: () => undefined, signOut: async () => undefined,
}
const draft = {
  id: '11111111-1111-4111-8111-111111111111', kind: 'new_library', repositoryId: null,
  status: 'review_ready', uploaderClerkUserId: 'admin_one', repositoryKey: 'demo', repositoryName: 'Demo Library',
  createdAt: '2026-08-13T10:00:00.000Z', updatedAt: '2026-08-13T10:01:00.000Z', expiresAt: '2026-09-12T10:00:00.000Z',
}

function renderPage(path: string, element: ReactNode, routePath = '*') {
  return render(<MemoryRouter initialEntries={[path]}><AppAuthProvider value={auth}><Routes><Route path={routePath} element={element} /></Routes></AppAuthProvider></MemoryRouter>)
}

describe('administrator import workflow', () => {
  it('lists durable drafts and clearly states that publication is unavailable', async () => {
    server.use(http.get('/api/app/admin/imports', () => HttpResponse.json({ imports: [draft] })))
    const view = renderPage('/admin/imports', <AdministratorImportsPage />)
    expect(await screen.findByRole('heading', { name: 'Demo Library' })).toBeVisible()
    expect(screen.getByText(/does not publish symbols yet/i)).toBeVisible()
    expect(screen.getByRole('link', { name: 'New library import' })).toHaveAttribute('href', '/admin/imports/new')
    await expectNoAccessibilityViolations(view.container)
  })

  it('renders an accessible complete new-library upload form', async () => {
    const view = renderPage('/admin/imports/new', <NewAdministratorImportPage />)
    expect(screen.getByLabelText('Repository key')).toBeRequired()
    expect(screen.getByLabelText('Library name')).toBeRequired()
    expect(screen.getByLabelText('Licence URL')).toHaveAttribute('type', 'url')
    expect(screen.getByLabelText('Library ZIP')).toHaveAttribute('accept', '.zip,application/zip')
    await expectNoAccessibilityViolations(view.container)
  })

  it('offers a populated public-library picker for existing-library imports', async () => {
    server.use(http.get('/api/app/admin/imports/repositories', () => HttpResponse.json({
      repositories: [{ id: 7, key: 'arasaac', name: 'ARASAAC' }],
    })))
    const view = renderPage('/admin/imports/new', <NewAdministratorImportPage />)
    fireEvent.change(screen.getByLabelText('Import type'), { target: { value: 'existing_library' } })
    const repository = await screen.findByLabelText('Existing library')
    expect(within(repository).getByRole('option', { name: 'ARASAAC (arasaac)' })).toHaveValue('7')
    expect(screen.queryByLabelText('Existing repository ID')).not.toBeInTheDocument()
    await expectNoAccessibilityViolations(view.container)
  })

  it('shows accepted files, grouped findings, actor attribution, and disabled publication', async () => {
    server.use(http.get('/api/app/admin/imports/:id', () => HttpResponse.json({ import: {
      ...draft, uploadSize: 100,
      files: [{ path: 'hello.svg', mediaType: 'image/svg+xml', size: 100, sha256: 'a'.repeat(64), sanitized: true }],
      results: [{ path: 'hello.svg', code: 'svg_content_removed', severity: 'warning', message: 'Unsafe content was removed.' }],
      auditEvents: [{ actorClerkUserId: 'admin_one', eventType: 'validation_completed', createdAt: draft.updatedAt }],
    } })))
    const view = renderPage(`/admin/imports/${draft.id}`, <AdministratorImportDetailPage />, '/admin/imports/:id')
    expect(await screen.findByRole('heading', { name: 'Demo Library' })).toBeVisible()
    expect(screen.getByText('Unsafe content was removed.')).toBeVisible()
    expect(within(screen.getByRole('table')).getByText('hello.svg')).toBeVisible()
    expect(screen.getByText(/validation completed by admin_one/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /publish library/i })).toBeDisabled()
    await expectNoAccessibilityViolations(view.container)
  })
})
