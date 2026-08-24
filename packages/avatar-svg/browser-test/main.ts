import { renderAvatarPng } from '../src/browser.js'
import { developmentArtKit, developmentDefaultIdentity, developmentNeutralAction } from '../src/development-art-kit.js'
import { serializeAvatarSvg } from '../src/serialize.js'
import { fixtureAction, fixtureArtKit, fixtureIdentity } from '../tests/fixtures.js'

declare global {
  interface Window {
    runAvatarPngCheck: () => Promise<{ type: string; width: number; height: number; cornerAlpha: number; centerAlpha: number }>
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
  const centerAlpha = context.getImageData(bitmap.width / 2, bitmap.height / 2, 1, 1).data[3] ?? -1
  return { type: blob.type, width: bitmap.width, height: bitmap.height, cornerAlpha, centerAlpha }
}

const preview = serializeAvatarSvg(developmentArtKit, developmentDefaultIdentity, developmentNeutralAction)
if (preview.kind === 'ready') {
  const image = document.createElement('img')
  image.alt = 'Development avatar preview'
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`
  document.body.append(image)
}
