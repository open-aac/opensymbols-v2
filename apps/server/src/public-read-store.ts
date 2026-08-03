import { Pool, type QueryResultRow } from 'pg'
import { decodeGoSecure, encodeGoSecure, GoSecureDecodeError } from './go-secure.js'
import type {
  JsonValue,
  RepositoryRecord,
  RepositorySettings,
  SymbolRecord,
  SymbolSettings,
} from './public-read-types.js'
import type {
  CharacterDeleteResult,
  CharacterListResult,
  CharacterRecord,
  CharacterResult,
  CharacterStore,
  CharacterUpdateResult,
  CharacterWrite,
} from './character-store.js'

interface RepositoryDatabaseRow extends QueryResultRow {
  repo_key: string
  settings: string | null
}

interface SymbolDatabaseRow extends QueryResultRow {
  id: number
  repo_key: string
  symbol_key: string
  enabled: boolean | null
  has_skin: boolean | null
  unsafe_result: boolean | null
  settings: string | null
}

interface SymbolRequestDatabaseRow extends QueryResultRow {
  id: number
  settings: string | null
}

interface ExternalSourceDatabaseRow extends QueryResultRow {
  id: number
  token: string
  settings: string | null
}

interface AppUserDatabaseRow extends QueryResultRow {
  deleted_at: Date | string | null
}

interface CharacterDatabaseRow extends QueryResultRow {
  id: string
  clerk_user_id: string
  name: string
  template_key: string
  template_version: number
  configuration_version: number
  settings: {
    skinColour: CharacterRecord['settings']['skinColour']
    hairColour?: CharacterRecord['settings']['hairColour']
  }
  revision: number
  created_at: Date | string
  updated_at: Date | string
}

export interface ExternalSourceRecord {
  id: number
  token: string
  settings: {
    name?: string
    email?: string
    purpose?: string
    approved?: boolean
    full_access?: boolean
    [key: string]: JsonValue | undefined
  }
}

export interface DatabaseSession {
  query<Row extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>
}

export interface DatabaseClient extends DatabaseSession {
  transaction<Result>(work: (session: DatabaseSession) => Promise<Result>): Promise<Result>
}

export interface PublicReadStore {
  listRepositories(): Promise<RepositoryRecord[]>
  findRepository(repoKey: string): Promise<RepositoryRecord | null>
  findSymbol(repoKey: string, symbolKey: string): Promise<SymbolRecord | null>
  close(): Promise<void>
}

export interface PublicDiscoveryStore extends PublicReadStore {
  listSymbols(): Promise<SymbolRecord[]>
  listRepositorySymbols(repoKey: string): Promise<SymbolRecord[]>
  addSymbolRequest(phrase: string, comment: string, createdAt: string): Promise<void>
}

export interface PublicApiStore extends PublicDiscoveryStore {
  createExternalSource(
    token: string,
    settings: ExternalSourceRecord['settings'],
    createdAt: string,
  ): Promise<ExternalSourceRecord>
  findExternalSourceByToken(token: string): Promise<ExternalSourceRecord | null>
  findExternalSourceById(id: number): Promise<ExternalSourceRecord | null>
}

export interface PostgresPublicReadStoreOptions {
  connectionString: string
  encryptionKey?: string
}

function settingsObject(value: string | null, encryptionKey: string | undefined) {
  if (value === null) throw new GoSecureDecodeError()
  const decoded = decodeGoSecure(value, encryptionKey)
  if (decoded === null || Array.isArray(decoded) || typeof decoded !== 'object') {
    throw new GoSecureDecodeError()
  }
  return decoded as { [key: string]: JsonValue }
}

export class PostgresPublicReadStore implements PublicApiStore, CharacterStore {
  constructor(
    private readonly database: DatabaseClient,
    private readonly encryptionKey?: string,
    private readonly closeDatabase: () => Promise<void> = async () => undefined,
  ) {}

  async listRepositories() {
    const result = await this.database.query<RepositoryDatabaseRow>(
      'SELECT repo_key, settings FROM symbol_repositories ORDER BY id',
    )
    return result.rows.map((row) => this.repositoryRecord(row))
  }

  async findRepository(repoKey: string) {
    const result = await this.database.query<RepositoryDatabaseRow>(
      'SELECT repo_key, settings FROM symbol_repositories WHERE repo_key = $1 LIMIT 1',
      [repoKey],
    )
    const row = result.rows[0]
    return row ? this.repositoryRecord(row) : null
  }

  async findSymbol(repoKey: string, symbolKey: string) {
    const result = await this.database.query<SymbolDatabaseRow>(
      `SELECT id, repo_key, symbol_key, enabled, has_skin, unsafe_result, settings
       FROM picture_symbols
       WHERE repo_key = $1 AND symbol_key = $2
       LIMIT 1`,
      [repoKey, symbolKey],
    )
    const row = result.rows[0]
    if (!row) return null

    return this.symbolRecord(row)
  }

  async listSymbols() {
    const result = await this.database.query<SymbolDatabaseRow>(
      `SELECT id, repo_key, symbol_key, enabled, has_skin, unsafe_result, settings
       FROM picture_symbols
       ORDER BY id`,
    )
    return result.rows.map((row) => this.symbolRecord(row))
  }

  async listRepositorySymbols(repoKey: string) {
    const result = await this.database.query<SymbolDatabaseRow>(
      `SELECT id, repo_key, symbol_key, enabled, has_skin, unsafe_result, settings
       FROM picture_symbols
       WHERE repo_key = $1
       ORDER BY id`,
      [repoKey],
    )
    return result.rows.map((row) => this.symbolRecord(row))
  }

  async addSymbolRequest(phrase: string, comment: string, createdAt: string) {
    await this.database.transaction(async (session) => {
      await session.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`en:${phrase}`])
      const result = await session.query<SymbolRequestDatabaseRow>(
        `SELECT id, settings
         FROM symbol_requests
         WHERE phrase = $1 AND locale = 'en'
         ORDER BY id
         LIMIT 1
         FOR UPDATE`,
        [phrase],
      )
      const existing = result.rows[0]
      const decoded = existing
        ? settingsObject(existing.settings, this.encryptionKey)
        : {}
      const comments = Array.isArray(decoded.comments) ? [...decoded.comments] : []
      comments.push({ user_id: null, text: comment, timestamp: createdAt })
      const settings = encodeGoSecure(
        { ...decoded, comments, n_votes: comments.length },
        this.encryptionKey,
      )

      if (existing) {
        await session.query('UPDATE symbol_requests SET settings = $1, updated_at = $2 WHERE id = $3', [
          settings,
          createdAt,
          existing.id,
        ])
      } else {
        await session.query(
          `INSERT INTO symbol_requests (phrase, locale, settings, created_at, updated_at)
           VALUES ($1, 'en', $2, $3, $3)`,
          [phrase, settings, createdAt],
        )
      }
    })
  }

  async createExternalSource(
    token: string,
    sourceSettings: ExternalSourceRecord['settings'],
    createdAt: string,
  ) {
    const settings = encodeGoSecure(
      { ...sourceSettings } as { [key: string]: JsonValue },
      this.encryptionKey,
    )
    const result = await this.database.query<ExternalSourceDatabaseRow>(
      `INSERT INTO external_sources (token, settings, created_at, updated_at)
       VALUES ($1, $2, $3, $3)
       RETURNING id, token, settings`,
      [token, settings, createdAt],
    )
    return this.externalSourceRecord(result.rows[0]!)
  }

  async findExternalSourceByToken(token: string) {
    const result = await this.database.query<ExternalSourceDatabaseRow>(
      'SELECT id, token, settings FROM external_sources WHERE token = $1 LIMIT 1',
      [token],
    )
    const row = result.rows[0]
    return row ? this.externalSourceRecord(row) : null
  }

  async findExternalSourceById(id: number) {
    const result = await this.database.query<ExternalSourceDatabaseRow>(
      'SELECT id, token, settings FROM external_sources WHERE id = $1 LIMIT 1',
      [id],
    )
    const row = result.rows[0]
    return row ? this.externalSourceRecord(row) : null
  }

  async listCharacters(clerkUserId: string, now: string): Promise<CharacterListResult> {
    return this.database.transaction(async (session) => {
      if (!await this.ensureActiveAppUser(session, clerkUserId, now)) return { kind: 'account_deleted' }
      const result = await session.query<CharacterDatabaseRow>(
        `SELECT id, clerk_user_id, name, template_key, template_version,
                configuration_version, settings, revision, created_at, updated_at
         FROM characters
         WHERE clerk_user_id = $1
         ORDER BY updated_at DESC, id DESC`,
        [clerkUserId],
      )
      return { kind: 'ok', characters: result.rows.map((row) => this.characterRecord(row)) }
    })
  }

  async findCharacter(clerkUserId: string, id: string, now: string): Promise<CharacterResult> {
    return this.database.transaction(async (session) => {
      if (!await this.ensureActiveAppUser(session, clerkUserId, now)) return { kind: 'account_deleted' }
      const result = await session.query<CharacterDatabaseRow>(
        `SELECT id, clerk_user_id, name, template_key, template_version,
                configuration_version, settings, revision, created_at, updated_at
         FROM characters
         WHERE id = $1 AND clerk_user_id = $2
         LIMIT 1`,
        [id, clerkUserId],
      )
      const row = result.rows[0]
      return row ? { kind: 'ok', character: this.characterRecord(row) } : { kind: 'not_found' }
    })
  }

  async createCharacter(
    clerkUserId: string,
    id: string,
    character: CharacterWrite,
    now: string,
  ): Promise<CharacterResult> {
    return this.database.transaction(async (session) => {
      if (!await this.ensureActiveAppUser(session, clerkUserId, now)) return { kind: 'account_deleted' }
      const result = await session.query<CharacterDatabaseRow>(
        `INSERT INTO characters
           (id, clerk_user_id, name, template_key, template_version,
            configuration_version, settings, revision, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $8)
         RETURNING id, clerk_user_id, name, template_key, template_version,
                   configuration_version, settings, revision, created_at, updated_at`,
        [
          id,
          clerkUserId,
          character.name,
          character.templateKey,
          character.templateVersion,
          character.configurationVersion,
          character.settings,
          now,
        ],
      )
      return { kind: 'ok', character: this.characterRecord(result.rows[0]!) }
    })
  }

  async updateCharacter(
    clerkUserId: string,
    id: string,
    character: CharacterWrite,
    revision: number,
    now: string,
  ): Promise<CharacterUpdateResult> {
    return this.database.transaction(async (session) => {
      if (!await this.ensureActiveAppUser(session, clerkUserId, now)) return { kind: 'account_deleted' }
      const result = await session.query<CharacterDatabaseRow>(
        `UPDATE characters
         SET name = $3, template_key = $4, template_version = $5,
             configuration_version = $6, settings = $7,
             revision = revision + 1, updated_at = $8
         WHERE id = $1 AND clerk_user_id = $2 AND revision = $9
         RETURNING id, clerk_user_id, name, template_key, template_version,
                   configuration_version, settings, revision, created_at, updated_at`,
        [
          id,
          clerkUserId,
          character.name,
          character.templateKey,
          character.templateVersion,
          character.configurationVersion,
          character.settings,
          now,
          revision,
        ],
      )
      const row = result.rows[0]
      if (row) return { kind: 'ok', character: this.characterRecord(row) }
      const existing = await session.query<QueryResultRow>(
        'SELECT 1 FROM characters WHERE id = $1 AND clerk_user_id = $2 LIMIT 1',
        [id, clerkUserId],
      )
      return existing.rows.length ? { kind: 'conflict' } : { kind: 'not_found' }
    })
  }

  async deleteCharacter(clerkUserId: string, id: string, now: string): Promise<CharacterDeleteResult> {
    return this.database.transaction(async (session) => {
      if (!await this.ensureActiveAppUser(session, clerkUserId, now)) return { kind: 'account_deleted' }
      const result = await session.query<QueryResultRow>(
        'DELETE FROM characters WHERE id = $1 AND clerk_user_id = $2 RETURNING id',
        [id, clerkUserId],
      )
      return result.rows.length ? { kind: 'deleted' } : { kind: 'not_found' }
    })
  }

  async deleteClerkUser(clerkUserId: string, now: string) {
    await this.database.transaction(async (session) => {
      await session.query(
        `INSERT INTO app_users (clerk_user_id, created_at, deleted_at)
         VALUES ($1, $2, $2)
         ON CONFLICT (clerk_user_id)
         DO UPDATE SET deleted_at = COALESCE(app_users.deleted_at, EXCLUDED.deleted_at)`,
        [clerkUserId, now],
      )
      await session.query('SELECT clerk_user_id FROM app_users WHERE clerk_user_id = $1 FOR UPDATE', [clerkUserId])
      await session.query('DELETE FROM characters WHERE clerk_user_id = $1', [clerkUserId])
    })
  }

  close() {
    return this.closeDatabase()
  }

  private repositoryRecord(row: RepositoryDatabaseRow): RepositoryRecord {
    return {
      repoKey: row.repo_key,
      settings: settingsObject(row.settings, this.encryptionKey) as RepositorySettings,
    }
  }

  private symbolRecord(row: SymbolDatabaseRow): SymbolRecord {
    return {
      id: row.id,
      repoKey: row.repo_key,
      symbolKey: row.symbol_key,
      enabled: row.enabled,
      hasSkin: row.has_skin,
      unsafeResult: row.unsafe_result,
      settings: settingsObject(row.settings, this.encryptionKey) as SymbolSettings,
    }
  }

  private externalSourceRecord(row: ExternalSourceDatabaseRow): ExternalSourceRecord {
    return {
      id: row.id,
      token: row.token,
      settings: settingsObject(row.settings, this.encryptionKey) as ExternalSourceRecord['settings'],
    }
  }

  private async ensureActiveAppUser(session: DatabaseSession, clerkUserId: string, now: string) {
    await session.query(
      `INSERT INTO app_users (clerk_user_id, created_at, deleted_at)
       VALUES ($1, $2, NULL)
       ON CONFLICT (clerk_user_id) DO NOTHING`,
      [clerkUserId, now],
    )
    const result = await session.query<AppUserDatabaseRow>(
      'SELECT deleted_at FROM app_users WHERE clerk_user_id = $1 FOR UPDATE',
      [clerkUserId],
    )
    return result.rows[0]?.deleted_at === null
  }

  private characterRecord(row: CharacterDatabaseRow): CharacterRecord {
    const date = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString()
    return {
      id: row.id,
      clerkUserId: row.clerk_user_id,
      name: row.name,
      templateKey: row.template_key,
      templateVersion: row.template_version,
      configurationVersion: row.configuration_version,
      settings: {
        skinColour: row.settings.skinColour,
        hairColour: row.settings.hairColour ?? 'original',
      },
      revision: row.revision,
      createdAt: date(row.created_at),
      updatedAt: date(row.updated_at),
    }
  }
}

export function createPostgresPublicReadStore(options: PostgresPublicReadStoreOptions) {
  const pool = new Pool({ connectionString: options.connectionString })
  const database: DatabaseClient = {
    async query<Row extends QueryResultRow>(text: string, values?: unknown[]) {
      const result = await pool.query<Row>(text, values)
      return { rows: result.rows }
    },
    async transaction<Result>(work: (session: DatabaseSession) => Promise<Result>) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await work({
          async query<Row extends QueryResultRow>(text: string, values?: unknown[]) {
            const queryResult = await client.query<Row>(text, values)
            return { rows: queryResult.rows }
          },
        })
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
  }
  return new PostgresPublicReadStore(database, options.encryptionKey, () => pool.end())
}
