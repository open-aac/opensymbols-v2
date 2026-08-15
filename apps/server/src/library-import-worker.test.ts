import { describe, expect, it, vi } from 'vitest'
import { createImportValidationWorker } from './library-import-worker.js'

describe('createImportValidationWorker', () => {
  it('waits for active validation to settle before stopping', async () => {
    let finish: (() => void) | undefined
    const processNext = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const worker = createImportValidationWorker(processNext, vi.fn())
    worker.poll()

    let stopped = false
    const stopping = worker.stop().then(() => { stopped = true })
    await Promise.resolve()
    expect(stopped).toBe(false)

    finish?.()
    await stopping
    expect(stopped).toBe(true)
    worker.poll()
    expect(processNext).toHaveBeenCalledTimes(1)
  })

  it('reports processing errors and can still stop cleanly', async () => {
    const error = new Error('validation failed')
    const onError = vi.fn()
    const worker = createImportValidationWorker(async () => { throw error }, onError)
    worker.poll()
    await worker.stop()
    expect(onError).toHaveBeenCalledWith(error)
  })
})
