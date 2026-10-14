/**
 * One document write at a time. Manual Save and IndexedDB autosave share this
 * so they do not serialize the same project concurrently.
 */
let chain: Promise<void> = Promise.resolve()
let active = 0

export async function enqueueDocumentWrite<T>(fn: () => Promise<T> | T): Promise<T> {
  if (active > 0) return await fn()
  const run = chain.then(async () => {
    active++
    try {
      return await fn()
    } finally {
      active--
    }
  })
  chain = run.then(() => undefined, () => undefined)
  return run
}

export function resetDocumentWriteQueue(): void {
  chain = Promise.resolve()
  active = 0
}
