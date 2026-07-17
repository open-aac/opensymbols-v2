import { useCallback, useEffect, useState } from 'react'

export function useAsync<T>(loader: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    let active = true
    /* eslint-disable react-hooks/set-state-in-effect -- dependency changes intentionally reset request state. */
    setLoading(true)
    setError(undefined)
    /* eslint-enable react-hooks/set-state-in-effect */

    loader()
      .then((value) => {
        if (active) setData(value)
      })
      .catch((reason: Error) => {
        if (active) setError(reason)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // The caller owns the dependency list, just like useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, attempt])

  return { data, error, loading, retry }
}
