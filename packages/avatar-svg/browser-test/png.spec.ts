import { expect, test } from '@playwright/test'

test('renders a transparent 1024 × 1024 PNG in a real browser', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(() => window.runAvatarPngCheck())
  expect(result).toEqual({ type: 'image/png', width: 1024, height: 1024, cornerAlpha: 0, centerAlpha: 255 })
})
