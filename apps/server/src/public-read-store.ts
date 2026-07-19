import { Pool, type QueryResultRow } from 'pg'
import { decodeGoSecure, GoSecureDecodeError } from './go-secure.js'
import type {
  JsonValue,
  RepositoryRecord,
  RepositorySettings,
  SymbolRecord,
  SymbolSettings,
} from './public-read-types.js'

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

export interface DatabaseClient {
  query<Row extends QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: Row[] }>
}

export interface PublicReadStore {
  listRepositories(): Promise<RepositoryRecord[]>
  findRepository(repoKey: string): Promise<RepositoryRecord | null>
  findSymbol(repoKey: string, symbolKey: string): Promise<SymbolRecord | null>
  close(): Promise<void>
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

export class PostgresPublicReadStore implements PublicReadStore {
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

  close() {
    return this.closeDatabase()
  }

  private repositoryRecord(row: RepositoryDatabaseRow): RepositoryRecord {
    return {
      repoKey: row.repo_key,
      settings: settingsObject(row.settings, this.encryptionKey) as RepositorySettings,
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
  }
  return new PostgresPublicReadStore(database, options.encryptionKey, () => pool.end())
}
