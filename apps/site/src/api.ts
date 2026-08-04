import type { PaginatedSymbols, Repository, SymbolResult } from './types'

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

export interface AppSessionResponse {
  user_id: string
}

export type CharacterSkinColour = 'original' | 'light' | 'medium-light' | 'medium' | 'medium-dark' | 'dark'
export type CharacterHairColour = 'original' | 'black' | 'dark-brown' | 'brown' | 'light-brown' | 'blond' | 'auburn' | 'grey' | 'white'
export type CharacterShirtColour = 'original' | 'black' | 'white' | 'grey' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple'

export interface SavedCharacter {
  id: string
  name: string
  template_key: 'base-character-prototype'
  template_version: 1
  configuration_version: 1
  settings: { skin_colour: CharacterSkinColour; hair_colour: CharacterHairColour; shirt_colour: CharacterShirtColour }
  revision: number
  created_at: string
  updated_at: string
}

export interface CharacterWrite {
  name: string
  template_key: 'base-character-prototype'
  template_version: 1
  configuration_version: 1
  settings: { skin_colour: CharacterSkinColour; hair_colour: CharacterHairColour; shirt_colour: CharacterShirtColour }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
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

export async function getAppSession(getToken: () => Promise<string | null>) {
  const token = await getToken()
  if (!token) throw new ApiError('Authentication required', 401)

  const response = await fetch('/api/app/session', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status)
  }
  return response.json() as Promise<AppSessionResponse>
}

async function characterRequest<T>(
  getToken: () => Promise<string | null>,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken()
  if (!token) throw new ApiError('Authentication required', 401, 'authentication_required')
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  })
  if (!response.ok) {
    let code: string | undefined
    try {
      const body = await response.json() as { error?: unknown }
      if (typeof body.error === 'string') code = body.error
    } catch {
      // The status remains the authoritative failure signal.
    }
    throw new ApiError(`Request failed with status ${response.status}`, response.status, code)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function getCharacters(getToken: () => Promise<string | null>) {
  return (await characterRequest<{ characters: SavedCharacter[] }>(
    getToken,
    '/api/app/characters',
  )).characters
}

export async function getCharacter(getToken: () => Promise<string | null>, id: string) {
  return (await characterRequest<{ character: SavedCharacter }>(
    getToken,
    `/api/app/characters/${encodeURIComponent(id)}`,
  )).character
}

export async function createCharacter(
  getToken: () => Promise<string | null>,
  character: CharacterWrite,
) {
  return (await characterRequest<{ character: SavedCharacter }>(getToken, '/api/app/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(character),
  })).character
}

export async function updateCharacter(
  getToken: () => Promise<string | null>,
  id: string,
  character: CharacterWrite,
  revision: number,
) {
  return (await characterRequest<{ character: SavedCharacter }>(
    getToken,
    `/api/app/characters/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...character, revision }),
    },
  )).character
}

export function deleteCharacter(getToken: () => Promise<string | null>, id: string) {
  return characterRequest<void>(getToken, `/api/app/characters/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
