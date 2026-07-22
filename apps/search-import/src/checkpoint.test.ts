import { describe, expect, it, vi } from 'vitest'
import { uploadWithCheckpoint } from './checkpoint.js'

async function* records() {
  for (let value = 1; value <= 5; value += 1) yield value
}

describe('resumable uploads', () => {
  it('skips acknowledged records and checkpoints only acknowledged batches', async () => {
    const upload = vi.fn(async () => undefined)
    const save = vi.fn(async () => undefined)
    const completed = await uploadWithCheckpoint({
      records: records(), completed: 2, batchSize: 2, upload, save,
    })
    expect(upload.mock.calls).toEqual([[[3, 4]], [[5]]])
    expect(save.mock.calls).toEqual([[4], [5]])
    expect(completed).toBe(5)
  })

  it('does not advance a checkpoint when a batch is rejected', async () => {
    const save = vi.fn(async () => undefined)
    await expect(uploadWithCheckpoint({
      records: records(), completed: 0, batchSize: 2,
      upload: async () => { throw new Error('quota') }, save,
    })).rejects.toThrow('quota')
    expect(save).not.toHaveBeenCalled()
  })
})
