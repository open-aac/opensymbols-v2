import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import type { LibraryImportEngine } from './library-import-engine.js'
import type { ImportDraftStore } from './library-import-types.js'

const id = '11111111-1111-4111-8111-111111111111'
const draft = {
  id, kind: 'new_library' as const, repositoryId: null, status: 'awaiting_upload' as const,
  uploadObjectKey: `imports/${id}/source.zip`, uploaderClerkUserId: 'admin_one',
  createdAt: '2026-08-13T10:00:00.000Z', updatedAt: '2026-08-13T10:00:00.000Z',
  expiresAt: '2026-09-12T10:00:00.000Z', repositoryKey: 'demo', repositoryName: 'Demo',
}

function administratorApp(overrides: {
  store?: Partial<ImportDraftStore>
  engine?: Partial<LibraryImportEngine>
  administrator?: boolean
} = {}) {
  const store = {
    listDrafts: vi.fn().mockResolvedValue([draft]),
    findDraftDetail: vi.fn().mockResolvedValue({ ...draft, uploadSize: null, files: [], results: [], auditEvents: [] }),
    listPublicRepositories: vi.fn().mockResolvedValue([{ id: 7, key: 'arasaac', name: 'ARASAAC' }]),
    publicRepositoryExists: vi.fn().mockResolvedValue(true),
    ...overrides.store,
  } as ImportDraftStore
  const engine = {
    createDraft: vi.fn().mockResolvedValue({
      draft,
      upload: {
        method: 'put', url: `/api/app/admin/imports/${id}/content`, fields: {},
        objectKey: draft.uploadObjectKey, expiresAt: '2026-08-13T10:10:00.000Z', maximumBytes: 200,
      },
    }),
    ...overrides.engine,
  } as unknown as LibraryImportEngine
  return { store, engine, app: createApp({
    appSessionVerifier: { verify: async () => ({ userId: 'admin_one', administrator: overrides.administrator ?? true }) },
    importDraftStore: store,
    libraryImportEngine: engine,
  }) }
}

describe('administrator library import routes', () => {
  it('lists organizational drafts without leaking private storage keys', async () => {
    const response = await administratorApp().app.request('/api/app/admin/imports', {
      headers: { Authorization: 'Bearer valid' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = await response.json() as { imports: Array<Record<string, unknown>> }
    expect(body.imports[0]).not.toHaveProperty('uploadObjectKey')
    expect(JSON.stringify(body)).not.toContain('imports/11111111')
  })

  it('creates a new-library draft with validated metadata and a safe upload response', async () => {
    const { app, engine } = administratorApp()
    const response = await app.request('/api/app/admin/imports', {
      method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'new_library', repository_id: null, repository_key: 'demo', repository_name: 'Demo',
        default_license: 'CC BY', license_url: 'https://example.test/license', attribution_name: 'Example Artist',
      }),
    })
    expect(response.status).toBe(201)
    expect(engine.createDraft).toHaveBeenCalledWith('admin_one', 'new_library', null, expect.objectContaining({ repositoryKey: 'demo' }))
    const body = await response.json() as { draft: Record<string, unknown>; upload: Record<string, unknown> }
    expect(body.draft).not.toHaveProperty('uploadObjectKey')
    expect(body.upload).not.toHaveProperty('objectKey')
  })

  it('lists only the public repositories supplied by the catalog store', async () => {
    const response = await administratorApp().app.request('/api/app/admin/imports/repositories', {
      headers: { Authorization: 'Bearer valid' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ repositories: [{ id: 7, key: 'arasaac', name: 'ARASAAC' }] })
  })

  it('rejects invalid metadata and ordinary users at the centralized boundary', async () => {
    const invalid = await administratorApp().app.request('/api/app/admin/imports', {
      method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'new_library', repository_key: 'demo', license_url: 'http://unsafe.test' }),
    })
    const forbidden = await administratorApp({ administrator: false }).app.request('/api/app/admin/imports', {
      headers: { Authorization: 'Bearer valid' },
    })
    expect(invalid.status).toBe(422)
    expect(forbidden.status).toBe(403)
  })
})
