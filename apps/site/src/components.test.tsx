import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PageState, SymbolCard } from './components'
import { expectNoAccessibilityViolations } from './test/axe'
import { symbol } from './test/fixtures'

describe('accessible content components', () => {
  it('uses one named full-surface link for a symbol card', async () => {
    const view = render(<MemoryRouter><SymbolCard symbol={symbol} /></MemoryRouter>)
    const links = screen.getAllByRole('link')

    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAccessibleName(/Hello.*demo.*CC BY 4\.0/i)
    expect(withinCardImage()).toHaveAttribute('alt', '')
    await expectNoAccessibilityViolations(view.container)
  })

  it('announces loading without exposing an action', async () => {
    const view = render(<PageState loading onRetry={vi.fn()}><p>Loaded</p></PageState>)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    await expectNoAccessibilityViolations(view.container)
  })

  it('identifies errors and offers retry', async () => {
    const retry = vi.fn()
    const view = render(<PageState loading={false} error={new Error('offline')} onRetry={retry}><p>Loaded</p></PageState>)
    expect(screen.getByRole('alert')).toHaveTextContent('Loading failed')
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(retry).toHaveBeenCalledOnce()
    await expectNoAccessibilityViolations(view.container)
  })
})

function withinCardImage() {
  const image = document.querySelector('img')
  if (!image) throw new Error('Expected a symbol card image')
  return image
}
