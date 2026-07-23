import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PageState, SymbolCard } from './components'
import { expectNoAccessibilityViolations } from './test/axe'
import { symbol } from './test/fixtures'

describe('accessible content components', () => {
  it.each([
    { compact: false, label: 'regular' },
    { compact: true, label: 'compact' },
  ])('uses one named focusable full-surface link for a $label symbol card', async ({ compact }) => {
    const user = userEvent.setup()
    const view = render(<MemoryRouter><SymbolCard compact={compact} symbol={symbol} /></MemoryRouter>)
    const card = view.container.querySelector('.symbol-card')
    const link = screen.getByRole('link')

    expect(card).toHaveClass('symbol-card')
    expect(card).toHaveClass(compact ? 'symbol-card--compact' : 'symbol-card')
    expect(card).toContainElement(link)
    expect(link).toHaveClass('symbol-card__link')
    expect(link).toHaveAccessibleName(/Hello.*demo.*CC BY 4\.0/i)
    expect(withinCardImage()).toHaveAttribute('alt', '')
    await user.tab()
    expect(link).toHaveFocus()
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
