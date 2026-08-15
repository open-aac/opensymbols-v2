export interface ImportValidationWorker {
  start(): void
  poll(): void
  stop(): Promise<void>
}

export function createImportValidationWorker(
  processNext: () => Promise<unknown>,
  onError: (error: unknown) => void,
  intervalMilliseconds = 1_000,
): ImportValidationWorker {
  let timer: NodeJS.Timeout | undefined
  let active: Promise<void> | undefined
  let stopped = false

  const poll = () => {
    if (stopped || active) return
    active = processNext()
      .then(() => undefined)
      .catch(onError)
      .finally(() => { active = undefined })
  }

  return {
    start() {
      if (timer || stopped) return
      timer = setInterval(poll, intervalMilliseconds)
      timer.unref()
    },
    poll,
    async stop() {
      stopped = true
      if (timer) clearInterval(timer)
      timer = undefined
      await active
    },
  }
}
