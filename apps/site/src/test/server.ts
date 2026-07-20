import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { repository, smallerRepository, symbol } from './fixtures'

export const handlers = [
  http.get('/api/app/session', ({ request }) => {
    if (request.headers.get('Authorization') !== 'Bearer clerk-session-token') {
      return HttpResponse.json({ error: 'authentication_required' }, { status: 401 })
    }
    return HttpResponse.json({ user_id: 'user_demo' })
  }),
  http.post('/api/v2/token', () => HttpResponse.json({
    access_token: 'token::demo-access-token',
    expires: '2026-07-18T12:00:00Z',
  })),
  http.post('/api/v2/generate_secret', () => HttpResponse.json({
    shared_secret: 'generated-shared-secret',
  })),
  http.get('/api/v2/symbols', () => HttpResponse.json([symbol])),
  http.get('/api/v2/repositories', () =>
    HttpResponse.json({ repositories: [smallerRepository, repository] }),
  ),
  http.get('/api/v2/repositories/:repoKey', () => HttpResponse.json({ repository })),
  http.get('/api/v2/symbols/:repoKey/:symbolKey', () => HttpResponse.json({ symbol })),
  http.get('/api/v1/symbols/search', () => HttpResponse.json([symbol])),
  http.get('/api/v1/symbols/random', () => HttpResponse.json([
    symbol,
    { ...symbol, id: 2, symbol_key: 'drink-b2', name: 'Drink', skins: false },
  ])),
  http.get('/api/v1/repositories/:repoKey/symbols', ({ request }) => {
    const page = new URL(request.url).searchParams.get('page') || '0'
    const offset = Number(page) * 2
    return HttpResponse.json({
      symbols: [
        { ...symbol, id: offset + 1 },
        { ...symbol, id: offset + 2, symbol_key: `drink-${offset + 2}`, name: 'Drink' },
      ],
      ...(page === '0' ? { meta: { next_url: '/api/v1/repositories/demo/symbols?page=1' } } : {}),
    })
  }),
  http.post('/api/v1/symbols/requests', () => HttpResponse.json({ submitted: true })),
  http.get('/api/v1/token_check', () => HttpResponse.json({ valid: true, user_name: 'Demo Admin' })),
]

export const server = setupServer(...handlers)
