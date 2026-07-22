export interface CheckpointIdentity {
  sourceManifestSha256: string
  documentsSha256: string
  host: string
  symbolIndex: string
  symbolIndexCreatedAt: string
}

export interface UploadCheckpoint extends CheckpointIdentity {
  version: 1
  completed: number
}

export function completedForCheckpoint(value: unknown, identity: CheckpointIdentity) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return 0
  const checkpoint = value as Partial<UploadCheckpoint>
  return checkpoint.version === 1 &&
    checkpoint.sourceManifestSha256 === identity.sourceManifestSha256 &&
    checkpoint.documentsSha256 === identity.documentsSha256 &&
    checkpoint.host === identity.host &&
    checkpoint.symbolIndex === identity.symbolIndex &&
    checkpoint.symbolIndexCreatedAt === identity.symbolIndexCreatedAt &&
    Number.isSafeInteger(checkpoint.completed) && checkpoint.completed! >= 0
    ? checkpoint.completed!
    : 0
}

export function uploadCheckpoint(completed: number, identity: CheckpointIdentity): UploadCheckpoint {
  return { version: 1, completed, ...identity }
}

export async function uploadWithCheckpoint<T>(options: {
  records: AsyncIterable<T>
  completed: number
  batchSize: number
  upload(batch: T[]): Promise<void>
  save(completed: number): Promise<void>
}) {
  let ordinal = 0
  let completed = options.completed
  let batch: T[] = []
  const send = async () => {
    await options.upload(batch)
    completed += batch.length
    await options.save(completed)
    batch = []
  }
  for await (const record of options.records) {
    ordinal += 1
    if (ordinal <= completed) continue
    batch.push(record)
    if (batch.length === options.batchSize) await send()
  }
  if (batch.length) await send()
  return completed
}
