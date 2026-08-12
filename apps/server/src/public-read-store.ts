import { Pool, type QueryResultRow } from 'pg'
import type {
  JsonValue,
  RepositoryRecord,
  SymbolRecord,
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
  name: string | null
  description: string | null
  website_url: string | null
  active: boolean
  protected: boolean
  repository_type: string | null
  symbol_count: number | null
  protected_symbol_count: number | null
  attribution_license: string | null
  attribution_license_url: string | null
  attribution_author_name: string | null
  attribution_author_url: string | null
}

interface SymbolDatabaseRow extends QueryResultRow {
  id: number | string
  repo_key: string
  symbol_key: string
  name: string | null
  description: string | null
  row_enabled: boolean | null
  settings_enabled: boolean | null
  row_has_skin: boolean | null
  settings_has_skin: boolean | null
  has_variants: boolean
  row_unsafe: boolean | null
  settings_unsafe: boolean | null
  protected: boolean
  protected_symbol: boolean
  image_url: string | null
  file_extension: string | null
  license: string | null
  license_url: string | null
  author: string | null
  author_url: string | null
  source_url: string | null
  search_string: string | null
  use_scores: Record<string, number>
  locales: Record<string, {
    name: string | null
    description: string | null
    search_string: string | null
    use_scores: Record<string, number>
  }>
}

interface SymbolRequestDatabaseRow extends QueryResultRow {
  id: number | string
  vote_count: number
}

interface ExternalSourceDatabaseRow extends QueryResultRow {
  id: number | string
  shared_secret: string
  name: string | null
  email: string | null
  purpose: string | null
  organization: string | null
  organization_url: string | null
  website_url: string | null
  twitter: string | null
  approved: boolean
  full_access: boolean
  global_token: boolean
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
    shirtColour?: CharacterRecord['settings']['shirtColour']
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
}

const repositorySelect = `
  SELECT repo_key, name, description, website_url, active, protected, repository_type,
         symbol_count, protected_symbol_count, attribution_license,
         attribution_license_url, attribution_author_name, attribution_author_url
  FROM catalog_repositories`

const symbolSelect = `
  SELECT s.id, r.repo_key, s.symbol_key, s.name, s.description, s.row_enabled,
         s.settings_enabled, s.row_has_skin, s.settings_has_skin, s.has_variants,
         s.row_unsafe, s.settings_unsafe, s.protected, s.protected_symbol,
         s.image_url, s.file_extension, s.license, s.license_url, s.author,
         s.author_url, s.source_url, s.search_string,
         COALESCE((
           SELECT json_object_agg(signal.term, signal.score ORDER BY signal.ordinal)
           FROM catalog_symbol_search_signals signal
           WHERE signal.symbol_id = s.id AND signal.locale = 'en'
             AND signal.scope = 'base' AND signal.signal_type = 'use_score'
         ), '{}'::json) AS use_scores,
         COALESCE(localized.locales, '{}'::json) AS locales
  FROM catalog_symbols s
  JOIN catalog_repositories r ON r.id = s.repository_id
  LEFT JOIN LATERAL (
    SELECT json_object_agg(l.locale, json_strip_nulls(json_build_object(
      'name', l.name,
      'description', l.description,
      'search_string', l.search_string,
      'use_scores', COALESCE((
        SELECT json_object_agg(signal.term, signal.score ORDER BY signal.ordinal)
        FROM catalog_symbol_search_signals signal
        WHERE signal.symbol_id = l.symbol_id AND signal.locale = l.locale
          AND signal.signal_type = 'use_score'
          AND signal.scope = 'localization'
      ), '{}'::json)
    )) ORDER BY l.ordinal) AS locales
    FROM catalog_symbol_localizations l
    WHERE l.symbol_id = s.id
  ) localized ON true`

const externalSourceSelect = `
  SELECT id, shared_secret, name, email, purpose, organization, organization_url,
         website_url, twitter, approved, full_access, global_token
  FROM catalog_api_clients`

function stringSetting(value: JsonValue | undefined) {
  return typeof value === 'string' ? value : null
}

export class PostgresPublicReadStore implements PublicApiStore, CharacterStore {
  constructor(
    private readonly database: DatabaseClient,
    private readonly closeDatabase: () => Promise<void> = async () => undefined,
  ) {}

  async listRepositories() {
    const result = await this.database.query<RepositoryDatabaseRow>(
      `${repositorySelect} ORDER BY id`,
    )
    return result.rows.map((row) => this.repositoryRecord(row))
  }

  async findRepository(repoKey: string) {
    const result = await this.database.query<RepositoryDatabaseRow>(
      `${repositorySelect} WHERE repo_key = $1 LIMIT 1`,
      [repoKey],
    )
    const row = result.rows[0]
    return row ? this.repositoryRecord(row) : null
  }

  async findSymbol(repoKey: string, symbolKey: string) {
    const result = await this.database.query<SymbolDatabaseRow>(
      `${symbolSelect}
       WHERE r.repo_key = $1 AND s.symbol_key = $2
       LIMIT 1`,
      [repoKey, symbolKey],
    )
    const row = result.rows[0]
    if (!row) return null

    return this.symbolRecord(row)
  }

  async listSymbols() {
    const result = await this.database.query<SymbolDatabaseRow>(
      `${symbolSelect} ORDER BY s.id`,
    )
    return result.rows.map((row) => this.symbolRecord(row))
  }

  async listRepositorySymbols(repoKey: string) {
    const result = await this.database.query<SymbolDatabaseRow>(
      `${symbolSelect} WHERE r.repo_key = $1 ORDER BY s.id`,
      [repoKey],
    )
    return result.rows.map((row) => this.symbolRecord(row))
  }

  async addSymbolRequest(phrase: string, comment: string, createdAt: string) {
    await this.database.transaction(async (session) => {
      await session.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`en:${phrase}`])
      const result = await session.query<SymbolRequestDatabaseRow>(
        `SELECT id, vote_count
         FROM catalog_symbol_requests
         WHERE phrase = $1 AND locale = 'en'
         LIMIT 1
         FOR UPDATE`,
        [phrase],
      )
      const existing = result.rows[0]
      let requestId: number | string
      if (existing) {
        requestId = existing.id
        await session.query(
          `UPDATE catalog_symbol_requests
           SET vote_count = vote_count + 1, updated_at = $1 WHERE id = $2`,
          [createdAt, requestId],
        )
      } else {
        const inserted = await session.query<SymbolRequestDatabaseRow>(
          `INSERT INTO catalog_symbol_requests
             (migration_run_id, phrase, locale, vote_count, created_at, updated_at)
           VALUES (NULL, $1, 'en', 1, $2, $2)
           RETURNING id, vote_count`,
          [phrase, createdAt],
        )
        requestId = inserted.rows[0]!.id
      }
      const ordinal = await session.query<{ ordinal: number }>(
        `SELECT COALESCE(max(ordinal), -1)::int + 1 AS ordinal
         FROM catalog_symbol_request_comments WHERE request_id = $1`,
        [requestId],
      )
      await session.query(
        `INSERT INTO catalog_symbol_request_comments
           (migration_run_id, request_id, ordinal, user_id, comment_text, commented_at)
         VALUES (NULL, $1, $2, NULL, $3, $4)`,
        [requestId, ordinal.rows[0]!.ordinal, comment, createdAt],
      )
    })
  }

  async createExternalSource(
    token: string,
    sourceSettings: ExternalSourceRecord['settings'],
    createdAt: string,
  ) {
    const result = await this.database.query<ExternalSourceDatabaseRow>(
      `INSERT INTO catalog_api_clients
         (migration_run_id, shared_secret, name, email, purpose, organization,
          organization_url, website_url, twitter, approved, full_access, global_token,
          created_at, updated_at)
       VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
       RETURNING id, shared_secret, name, email, purpose, organization, organization_url,
                 website_url, twitter, approved, full_access, global_token`,
      [
        token, stringSetting(sourceSettings.name), stringSetting(sourceSettings.email),
        stringSetting(sourceSettings.purpose), stringSetting(sourceSettings.org),
        stringSetting(sourceSettings.org_url), stringSetting(sourceSettings.url),
        stringSetting(sourceSettings.twitter), sourceSettings.approved === true,
        sourceSettings.full_access === true, sourceSettings.global_token === true, createdAt,
      ],
    )
    return this.externalSourceRecord(result.rows[0]!)
  }

  async findExternalSourceByToken(token: string) {
    const result = await this.database.query<ExternalSourceDatabaseRow>(
      `${externalSourceSelect} WHERE shared_secret = $1 LIMIT 1`,
      [token],
    )
    const row = result.rows[0]
    return row ? this.externalSourceRecord(row) : null
  }

  async findExternalSourceById(id: number) {
    const result = await this.database.query<ExternalSourceDatabaseRow>(
      `${externalSourceSelect} WHERE id = $1 LIMIT 1`,
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
      settings: {
        name: row.name,
        description: row.description,
        url: row.website_url,
        active: row.active,
        protected: row.protected,
        repository_type: row.repository_type,
        n_symbols: row.symbol_count ?? undefined,
        n_protected_symbols: row.protected_symbol_count ?? undefined,
        default_attribution: {
          license: row.attribution_license,
          license_url: row.attribution_license_url,
          author_name: row.attribution_author_name,
          author_url: row.attribution_author_url,
        },
      },
    }
  }

  private symbolRecord(row: SymbolDatabaseRow): SymbolRecord {
    return {
      id: Number(row.id),
      repoKey: row.repo_key,
      symbolKey: row.symbol_key,
      enabled: row.row_enabled,
      hasSkin: row.row_has_skin,
      unsafeResult: row.row_unsafe,
      settings: {
        name: row.name,
        description: row.description,
        enabled: row.settings_enabled ?? undefined,
        image_url: row.image_url,
        file_extension: row.file_extension,
        license: row.license,
        license_url: row.license_url,
        author: row.author,
        author_url: row.author_url,
        source_url: row.source_url,
        protected: row.protected,
        protected_symbol: row.protected_symbol,
        unsafe_result: row.settings_unsafe ?? undefined,
        has_skin: row.settings_has_skin ?? undefined,
        has_variants: row.has_variants,
        search_string: row.search_string,
        use_scores: row.use_scores,
        locales: row.locales,
      },
    }
  }

  private externalSourceRecord(row: ExternalSourceDatabaseRow): ExternalSourceRecord {
    return {
      id: Number(row.id),
      token: row.shared_secret,
      settings: {
        name: row.name ?? undefined,
        email: row.email ?? undefined,
        purpose: row.purpose ?? undefined,
        org: row.organization ?? undefined,
        org_url: row.organization_url ?? undefined,
        url: row.website_url ?? undefined,
        twitter: row.twitter ?? undefined,
        approved: row.approved,
        full_access: row.full_access,
        global_token: row.global_token,
      },
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
        shirtColour: row.settings.shirtColour ?? 'original',
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
  return new PostgresPublicReadStore(database, () => pool.end())
}
