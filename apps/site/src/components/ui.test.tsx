import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAccessibilityViolations } from '../test/axe'
import { Button, ButtonLink, TextField } from './ui'

describe('accessible UI primitives', () => {
  it.each(['primary', 'secondary', 'quiet'] as const)('renders the %s button variant with a safe default type', (variant) => {
    render(<Button variant={variant}>Continue</Button>)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button')).toHaveClass(`action--${variant}`)
  })

  it('renders button links as navigation', () => {
    render(<MemoryRouter><ButtonLink to="/search">Find symbols</ButtonLink></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Find symbols' })).toHaveAttribute('href', '/search')
  })

  it('connects field labels, hints, errors, and disabled state', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const view = render(<TextField id="name" label="Name" hint="Use a familiar word." error="Enter a name." loading onChange={onChange} />)
    const field = screen.getByLabelText('Name')

    expect(field).toBeDisabled()
    expect(field).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Name is loading.')
    expect(field).toHaveAccessibleDescription('Use a familiar word. Enter a name.')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    await user.click(field)
    expect(onChange).not.toHaveBeenCalled()
    await expectNoAccessibilityViolations(view.container)
  })
})
