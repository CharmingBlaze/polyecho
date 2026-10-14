import { describe, expect, it, beforeEach } from 'vitest'
import { enqueueDocumentWrite, resetDocumentWriteQueue } from './documentWriteQueue'

describe('documentWriteQueue', () => {
  beforeEach(() => {
    resetDocumentWriteQueue()
  })

  it('runs queued writers in start order', async () => {
    const order: number[] = []
    const first = enqueueDocumentWrite(async () => {
      await Promise.resolve()
      order.push(1)
    })
    const second = enqueueDocumentWrite(async () => {
      order.push(2)
    })
    await Promise.all([first, second])
    expect(order).toEqual([1, 2])
  })

  it('does not deadlock when a writer enqueues a nested write', async () => {
    const order: number[] = []
    await enqueueDocumentWrite(async () => {
      order.push(1)
      await enqueueDocumentWrite(async () => {
        order.push(2)
      })
      order.push(3)
    })
    expect(order).toEqual([1, 2, 3])
  })
})
