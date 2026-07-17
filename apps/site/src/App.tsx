import { useEffect, useState } from 'react'

type ConnectionState = 'checking' | 'connected' | 'unavailable'

type HealthResponse = {
  status: 'ok'
}
export function App() {
  const [connection, setConnection] = useState<ConnectionState>('checking')

  useEffect(() => {
    const controller = new AbortController()

    async function checkServer() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal })
        const health = (await response.json()) as HealthResponse

        if (!response.ok || health.status !== 'ok') {
          throw new Error('Server health check failed')
        }

        setConnection('connected')
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setConnection('unavailable')
        }
      }
    }

    void checkServer()

    return () => controller.abort()
  }, [])

  const status = {
    checking: 'Checking server connection…',
    connected: 'Server connected',
    unavailable: 'Server unavailable',
  }[connection]

  return (
    <main>
      <section className="card">
        <p className="eyebrow">Open AAC</p>
        <h1>OpenSymbols v2</h1>
        <p className="intro">A new home for open symbol discovery and sharing.</p>
        <p className={`status status--${connection}`} role="status">
          <span aria-hidden="true" />
          {status}
        </p>
      </section>
    </main>
  )
}
