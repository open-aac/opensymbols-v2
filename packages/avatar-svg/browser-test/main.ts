import { renderAvatarPng } from '../src/browser.js'
import { fixtureAction, fixtureArtKit, fixtureIdentity } from '../tests/fixtures.js'

declare global {
  interface Window {
    runAvatarPngCheck: () => Promise<{ type: string; width: number; height: number; cornerAlpha: number }>
  }
}

window.runAvatarPngCheck = async () => {
  const blob = await renderAvatarPng(fixtureArtKit, fixtureIdentity, fixtureAction)
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas context unavailable')
  context.drawImage(bitmap, 0, 0)
  const cornerAlpha = context.getImageData(0, 0, 1, 1).data[3] ?? -1
  return { type: blob.type, width: bitmap.width, height: bitmap.height, cornerAlpha }
}
