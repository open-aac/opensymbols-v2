import { describe, expect, it, vi } from 'vitest'
import {
  completedForCheckpoint,
  uploadCheckpoint,
  uploadWithCheckpoint,
  type CheckpointIdentity,
} from './checkpoint.js'

const identity: CheckpointIdentity = {
  sourceManifestSha256: 'source-hash',
  documentsSha256: 'documents-hash',
  host: 'https://example.test',
  symbolIndex: 'symbols',
  symbolIndexCreatedAt: '2026-07-22T12:00:00Z',
  repositoryIndex: 'repositories',
  repositoryIndexCreatedAt: '2026-07-22T12:00:01Z',
}

async function* records() {
  for (let value = 1; value <= 5; value += 1) yield value
}

describe('resumable uploads', () => {
  it('reuses checkpoints only for the same dataset and index instance', () => {
    const saved = uploadCheckpoint(1_000, identity)
    expect(completedForCheckpoint(saved, identity)).toBe(1_000)
    expect(completedForCheckpoint(saved, { ...identity, host: 'https://other.test' })).toBe(0)
    expect(completedForCheckpoint(saved, { ...identity, documentsSha256: 'other-documents' })).toBe(0)
    expect(completedForCheckpoint(saved, {
      ...identity, symbolIndexCreatedAt: '2026-07-22T13:00:00Z',
    })).toBe(0)
    expect(completedForCheckpoint(saved, {
      ...identity, repositoryIndexCreatedAt: '2026-07-22T13:00:00Z',
    })).toBe(0)
    expect(completedForCheckpoint({ completed: 1_000 }, identity)).toBe(0)
  })

  it('records the last acknowledged document without weakening identity checks', () => {
    const saved = uploadCheckpoint(500, identity, '123_es')
    expect(saved.lastAcknowledgedDocumentId).toBe('123_es')
    expect(completedForCheckpoint(saved, identity)).toBe(500)
  })

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
