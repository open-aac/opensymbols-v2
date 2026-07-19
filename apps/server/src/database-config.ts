export interface DatabaseEnvironment {
  DATABASE_URL?: string
  POSTGRES_DB?: string
  POSTGRES_PASSWORD?: string
  POSTGRES_PORT?: string
  POSTGRES_USER?: string
}

function postgresPort(value: string | undefined) {
  const port = Number.parseInt(value ?? '5432', 10)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('POSTGRES_PORT must be an integer between 1 and 65535')
  }
  return port
}

export function databaseUrlFromEnvironment(environment: DatabaseEnvironment = process.env) {
  if (environment.DATABASE_URL) return environment.DATABASE_URL

  const user = encodeURIComponent(environment.POSTGRES_USER ?? 'opensymbols')
  const password = encodeURIComponent(environment.POSTGRES_PASSWORD ?? 'opensymbols')
  const database = encodeURIComponent(environment.POSTGRES_DB ?? 'opensymbols_development')
  return `postgresql://${user}:${password}@127.0.0.1:${postgresPort(environment.POSTGRES_PORT)}/${database}`
}
