import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the OpenSymbols heading and a successful server connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    render(<App />)

    expect(screen.getByRole('heading', { name: 'OpenSymbols v2' })).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Server connected')
  })

  it('reports when the server is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<App />)

    expect(await screen.findByRole('status')).toHaveTextContent('Server unavailable')
  })
})
