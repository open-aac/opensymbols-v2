import axe, { type RunOptions } from 'axe-core'
import { expect } from 'vitest'

export async function expectNoAccessibilityViolations(container: Element, options?: RunOptions) {
  // jsdom has no canvas implementation, so contrast is verified from the fixed token palette separately.
  const results = await axe.run(container, {
    ...options,
    rules: {
      'color-contrast': { enabled: false },
      ...options?.rules,
    },
  })
  const summary = results.violations.map((violation) => {
    const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ')
    return `${violation.id}: ${violation.help} (${targets})`
  }).join('\n')

  expect(results.violations, summary).toHaveLength(0)
}
