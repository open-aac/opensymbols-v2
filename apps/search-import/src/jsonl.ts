import { createReadStream, createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { finished } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { createInterface } from 'node:readline'

export async function* readJsonl<T>(path: string): AsyncGenerator<T> {
  const input = createReadStream(path)
  const stream = path.endsWith('.gz') ? input.pipe(createGunzip()) : input
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as T
  }
}

export async function writeJsonl<T>(path: string, records: AsyncIterable<T> | Iterable<T>) {
  const file = createWriteStream(path, { flags: 'wx' })
  const output = path.endsWith('.gz') ? createGzip({ level: 9 }) : file
  if (output !== file) output.pipe(file)
  for await (const record of records) {
    if (!output.write(`${JSON.stringify(record)}\n`)) await once(output, 'drain')
  }
  output.end()
  await finished(file)
}
