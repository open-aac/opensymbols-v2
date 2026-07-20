import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAccessibilityViolations } from '../test/axe'
import { ClerkUserControl } from './clerk-user-control'

vi.mock('@clerk/react-router', () => {
  function MockUserButton({
    appearance,
    children,
    showName,
  }: {
    appearance: { elements: { userButtonTrigger: Record<string, string> } }
    children: React.ReactNode
    showName: boolean
  }) {
    return (
      <div
        data-min-height={appearance.elements.userButtonTrigger.minHeight}
        data-min-width={appearance.elements.userButtonTrigger.minWidth}
        data-show-name={String(showName)}
      >
        <button aria-label="Open user menu">Avatar</button>
        {children}
      </div>
    )
  }

  MockUserButton.MenuItems = ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  MockUserButton.Link = ({ href, label }: { href: string; label: string }) => <a href={href}>{label}</a>
  MockUserButton.Action = ({ label }: { label: string }) => <button>{label}</button>

  return { UserButton: MockUserButton }
})

describe('Clerk user control', () => {
  it('uses an avatar-only 44px trigger and provides the account menu actions', async () => {
    const view = render(<ClerkUserControl />)
    const trigger = screen.getByRole('button', { name: 'Open user menu' })
    const configuration = trigger.parentElement

    expect(configuration).toHaveAttribute('data-show-name', 'false')
    expect(configuration).toHaveAttribute('data-min-width', '44px')
    expect(configuration).toHaveAttribute('data-min-height', '44px')
    expect(screen.getByRole('link', { name: 'OpenSymbols account' })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('button', { name: 'manageAccount' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'signOut' })).toBeInTheDocument()
    await expectNoAccessibilityViolations(view.container)
  })
})
