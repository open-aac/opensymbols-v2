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
