import { parseArgs } from 'node:util'
import { CatalogMigrator } from './catalog-migration.js'
import { databaseUrlFromEnvironment } from './database-config.js'

const [command] = process.argv.slice(2)
const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    'snapshot-id': { type: 'string' },
    'batch-size': { type: 'string' },
  },
  strict: true,
})

if (!['audit', 'migrate', 'verify', 'rollback'].includes(command ?? '')) {
  throw new Error('Usage: catalog:migrate <audit|migrate|verify|rollback> --snapshot-id <id>')
}
const snapshotId = values['snapshot-id']
if (!snapshotId) throw new Error('--snapshot-id is required')

const migrator = new CatalogMigrator({
  connectionString: databaseUrlFromEnvironment(),
  encryptionKey: process.env.LEGACY_GOSECURE_DECRYPTION_KEY,
  batchSize: values['batch-size'] === undefined ? undefined : Number(values['batch-size']),
})

try {
  const result = command === 'audit'
    ? await migrator.audit()
    : command === 'migrate'
      ? await migrator.migrate(snapshotId)
      : command === 'verify'
        ? await migrator.verify(snapshotId)
        : await migrator.rollback(snapshotId)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if ('verified' in result && !result.verified) process.exitCode = 1
  if ('unknownKeys' in result && result.unknownKeys.length > 0) process.exitCode = 1
} finally {
  await migrator.close()
}
