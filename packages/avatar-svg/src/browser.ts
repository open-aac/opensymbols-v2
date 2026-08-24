import type { AvatarArtKitManifest, CharacterActionV1, CharacterIdentityV1 } from './contracts.js'
import { serializeAvatarSvg } from './serialize.js'

export interface PngRenderOptions {
  size?: number
  title?: string
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The generated SVG could not be decoded.'))
    }
    image.src = url
  })
}

export async function renderSvgPng(svg: string, options: PngRenderOptions = {}): Promise<Blob> {
  const size = options.size ?? 1024
  if (!Number.isInteger(size) || size <= 0) throw new Error('PNG size must be a positive integer.')
  const image = await loadSvgImage(svg)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D rendering is unavailable.')
  context.clearRect(0, 0, size, size)
  context.drawImage(image, 0, 0, size, size)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('The browser could not encode the avatar PNG.'))
    }, 'image/png')
  })
}

export async function renderAvatarPng(
  artKit: AvatarArtKitManifest,
  identity: CharacterIdentityV1,
  action: CharacterActionV1,
  options: PngRenderOptions = {},
): Promise<Blob> {
  const result = serializeAvatarSvg(artKit, identity, action, options.title)
  if (result.kind === 'unavailable') throw new Error(`${result.code}: ${result.message}`)
  return renderSvgPng(result.svg, options)
}
