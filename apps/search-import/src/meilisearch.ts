import type { RepositoryDocument, SearchDocument } from './types.js'

export class MeilisearchImportError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryable = status === 429 || status >= 500,
  ) {
    super(`meilisearch: ${message}`)
  }
}

export interface MeilisearchImportConfig {
  host: string
  adminApiKey: string
  symbolIndex?: string
  repositoryIndex?: string
}

export class MeilisearchImportClient {
  readonly symbolIndex: string
  readonly repositoryIndex: string
  private readonly host: string

  constructor(private readonly config: MeilisearchImportConfig, private readonly request: typeof fetch = fetch) {
    this.host = config.host.replace(/\/$/, '')
    this.symbolIndex = config.symbolIndex ?? 'symbols'
    this.repositoryIndex = config.repositoryIndex ?? 'repositories'
  }

  async call(path: string, init: RequestInit = {}) {
    const response = await this.request(`${this.host}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.adminApiKey}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })
    const body = await response.text()
    if (!response.ok) throw new MeilisearchImportError(response.status, body.slice(0, 500))
    return body ? JSON.parse(body) as Record<string, unknown> : {}
  }

  async task(path: string, body: unknown, method = 'PUT') {
    const result = await this.call(path, { method, body: JSON.stringify(body) })
    if (typeof result.taskUid !== 'number') throw new Error('Meilisearch did not return a task UID.')
    await this.waitForTask(result.taskUid)
  }

  async ensureIndex(uid: string) {
    try {
      const task = await this.call('/indexes', {
        method: 'POST', body: JSON.stringify({ uid, primaryKey: 'id' }),
      })
      if (typeof task.taskUid === 'number') await this.waitForTask(task.taskUid)
    } catch (error) {
      const alreadyExists = error instanceof MeilisearchImportError &&
        (error.status === 409 || /already exists/i.test(error.message))
      if (!alreadyExists) throw error
    }
  }

  async configure() {
    await this.configureIndexes(this.symbolIndex, this.repositoryIndex)
  }

  async configureIndexes(symbolIndex: string, repositoryIndex: string) {
    await this.ensureIndex(symbolIndex)
    await this.ensureIndex(repositoryIndex)
    await this.task(`/indexes/${symbolIndex}/settings`, {
      filterableAttributes: [
        'repoKey', 'locale', 'safe', 'visible', 'symbolKey', 'symbolId', 'hasSkin',
      ],
      searchableAttributes: [
        'name', 'description', 'searchTerms', 'synonyms', 'englishName', 'englishDescription', 'text',
      ],
      rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
      },
      displayedAttributes: [
        'id', 'symbolId', 'symbolKey', 'repoKey', 'locale', 'safe', 'visible', 'name',
        'description', 'englishName', 'englishDescription', 'searchTerms', 'synonyms',
        'keywordBoosts', 'imageUrl', 'enabled', 'protected', 'hasSkin', 'hasVariants',
        'license', 'licenseUrl', 'author', 'authorUrl', 'sourceUrl', 'extension',
      ],
      sortableAttributes: ['symbolId'],
      pagination: { maxTotalHits: 120_000 },
    }, 'PATCH')
    await this.task(`/indexes/${repositoryIndex}/settings`, {
      filterableAttributes: ['repoKey', 'active', 'protected'],
      searchableAttributes: ['name', 'description', 'repoKey'],
      displayedAttributes: [
        'id', 'repoKey', 'name', 'description', 'active', 'protected', 'license',
        'licenseUrl', 'author', 'authorUrl', 'url', 'symbolCount',
      ],
      sortableAttributes: ['name'],
      pagination: { maxTotalHits: 10_000 },
    }, 'PATCH')
  }

  async uploadSymbols(documents: SearchDocument[]) {
    return this.call(`/indexes/${this.symbolIndex}/documents?primaryKey=id`, {
      method: 'POST', body: JSON.stringify(documents),
    })
  }

  async uploadRepositories(documents: RepositoryDocument[]) {
    return this.call(`/indexes/${this.repositoryIndex}/documents?primaryKey=id`, {
      method: 'POST', body: JSON.stringify(documents),
    })
  }

  async uploadSymbolsTo(index: string, documents: SearchDocument[], metadata: string) {
    return this.call(`/indexes/${index}/documents?primaryKey=id&customMetadata=${encodeURIComponent(metadata)}`, {
      method: 'POST', body: JSON.stringify(documents),
    })
  }

  async uploadRepositoriesTo(index: string, documents: RepositoryDocument[], metadata: string) {
    return this.call(`/indexes/${index}/documents?primaryKey=id&customMetadata=${encodeURIComponent(metadata)}`, {
      method: 'POST', body: JSON.stringify(documents),
    })
  }

  async searchIndex<T>(index: string, body: Record<string, unknown>) {
    return this.call(`/indexes/${encodeURIComponent(index)}/search`, {
      method: 'POST', body: JSON.stringify(body),
    }) as Promise<{ hits?: T[]; estimatedTotalHits?: number; totalHits?: number }>
  }

  async documents<T>(index: string, offset: number, limit: number) {
    return this.call(`/indexes/${encodeURIComponent(index)}/documents?offset=${offset}&limit=${limit}`) as Promise<{
      results?: T[]
      total?: number
    }>
  }

  async indexes() {
    return this.call('/indexes?limit=1000') as Promise<{
      results?: Array<{ uid?: string; createdAt?: string }>
    }>
  }

  async swapIndexes(pairs: Array<[string, string]>) {
    return this.task('/swap-indexes', pairs.map((indexes) => ({ indexes })), 'POST')
  }

  async deleteIndex(index: string) {
    const result = await this.call(`/indexes/${encodeURIComponent(index)}`, { method: 'DELETE' })
    if (typeof result.taskUid !== 'number') throw new Error('Meilisearch did not return a task UID.')
    await this.waitForTask(result.taskUid)
  }

  async version() {
    return this.call('/version') as Promise<{ pkgVersion?: string }>
  }

  async waitForTask(taskUid: number, timeoutMs = 300_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const task = await this.call(`/tasks/${taskUid}`) as {
        status?: string
        error?: { message?: string }
      }
      if (task.status === 'succeeded') return
      if (task.status === 'failed' || task.status === 'canceled') {
        throw new MeilisearchImportError(422, task.error?.message ?? `Task ${task.status}`, false)
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new MeilisearchImportError(408, 'Task timed out', true)
  }

  async stats(index: string) {
    return this.call(`/indexes/${index}/stats`) as Promise<{ numberOfDocuments?: number; isIndexing?: boolean }>
  }

  async indexInfo(index: string) {
    return this.call(`/indexes/${index}`) as Promise<{ uid?: string; createdAt?: string }>
  }

  async publicRepositoryCount() {
    const result = await this.call(`/indexes/${this.repositoryIndex}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: '', limit: 0, filter: ['active = true', 'protected = false'] }),
    })
    return Number(result.estimatedTotalHits ?? result.totalHits ?? 0)
  }
}
