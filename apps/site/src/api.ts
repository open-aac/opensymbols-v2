import type { PaginatedSymbols, Repository, SessionInfo, SymbolResult } from './types'

const MAX_INTERACTIVE_RESPONSE_LENGTH = 8_000

export interface InteractiveApiResult<T = unknown> {
  status: number
  ok: boolean
  output: string
  data?: T
}

export interface AccessTokenResponse {
  access_token: string
  expires?: string
}

export interface SharedSecretResponse {
  shared_secret: string
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function authToken() {
  return window.localStorage.getItem('auth_token') || ''
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = authToken()
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...init.headers,
    },
  })

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status)
  }

  return response.json() as Promise<T>
}

async function interactiveRequest<T>(url: string, init: RequestInit = {}): Promise<InteractiveApiResult<T>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  })
  const rawBody = await response.text()
  let data: T | undefined
  let formattedBody = rawBody

  try {
    data = JSON.parse(rawBody) as T
    formattedBody = JSON.stringify(data, null, 2)
  } catch {
    if (formattedBody.length > MAX_INTERACTIVE_RESPONSE_LENGTH) {
      formattedBody = `${formattedBody.slice(0, MAX_INTERACTIVE_RESPONSE_LENGTH)}\n\n[response truncated]`
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    output: `HTTP ${response.status}${formattedBody ? `\n${formattedBody}` : ''}`,
    data,
  }
}

export async function getRepositories() {
  return (await request<{ repositories: Repository[] }>('/api/v2/repositories')).repositories
}

export async function getRepository(repoKey: string) {
  return (
    await request<{ repository: Repository }>(`/api/v2/repositories/${encodeURIComponent(repoKey)}`)
  ).repository
}

export async function getSymbol(repoKey: string, symbolKey: string) {
  return (
    await request<{ symbol: SymbolResult }>(
      `/api/v2/symbols/${encodeURIComponent(repoKey)}/${encodeURIComponent(symbolKey)}`,
    )
  ).symbol
}

export function randomSymbols() {
  return request<SymbolResult[]>('/api/v1/symbols/random')
}

export function searchSymbols(query: string, locale = 'en', safe = true) {
  const params = new URLSearchParams({ q: query, locale, safe: safe ? '1' : '0' })
  return request<SymbolResult[]>(`/api/v1/symbols/search?${params}`)
}

export function getRepositorySymbols(
  repoKey: string,
  options: { page?: number; unsafe?: boolean; hasSkin?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (options.page) params.set('page', String(options.page))
  if (options.unsafe) params.set('unsafe', '1')
  if (options.hasSkin) params.set('has_skin', '1')
  const suffix = params.size ? `?${params}` : ''

  return request<PaginatedSymbols>(
    `/api/v1/repositories/${encodeURIComponent(repoKey)}/symbols${suffix}`,
  )
}

export function checkSession(token: string) {
  return request<SessionInfo>(`/api/v1/token_check?token=${encodeURIComponent(token)}`)
}

export function submitSymbolRequest(data: {
  name: string
  first_letter: string
  comments: string
}) {
  return request<{ submitted: boolean }>('/api/v1/symbols/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function generateAccessToken(secret: string) {
  return interactiveRequest<AccessTokenResponse>('/api/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret }),
  })
}

export function requestSharedSecret(application: {
  organization: string
  email: string
  purpose: string
}) {
  return interactiveRequest<SharedSecretResponse>('/api/v2/generate_secret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      org_name: application.organization,
      org_email: application.email,
      org_purpose: application.purpose,
    }),
  })
}

export function searchPublicApi(options: {
  accessToken: string
  query: string
  locale: string
  safe: boolean
}) {
  const params = new URLSearchParams({
    q: options.query,
    locale: options.locale,
    safe: options.safe ? '1' : '0',
  })

  return interactiveRequest<SymbolResult[]>(`/api/v2/symbols?${params}`, {
    headers: { Authorization: options.accessToken },
  })
}
