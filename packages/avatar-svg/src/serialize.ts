import { AVATAR_VIEW_BOX, type AvatarArtKitManifest, type AvatarUnavailableCode, type CharacterActionV1, type CharacterIdentityV1, type CompiledSvgNode } from './contracts.js'
import { resolveAvatar } from './resolve.js'

export type SvgSerializationResult =
  | { kind: 'ready'; svg: string }
  | { kind: 'unavailable'; code: AvatarUnavailableCode; message: string }

function escapeAttribute(value: string | number): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function serializeNode(node: CompiledSvgNode, colour: string): string {
  const attributes = Object.entries(node.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}="${escapeAttribute(value === 'currentColor' ? colour : value)}"`)
    .join(' ')
  const opening = attributes ? `<${node.element} ${attributes}>` : `<${node.element}>`
  return `${opening}${node.children?.map((child) => serializeNode(child, colour)).join('') ?? ''}</${node.element}>`
}

export function serializeAvatarSvg(
  artKit: AvatarArtKitManifest,
  identity: CharacterIdentityV1,
  action: CharacterActionV1,
  title = 'Avatar symbol',
): SvgSerializationResult {
  const resolution = resolveAvatar(artKit, identity, action)
  if (resolution.kind === 'unavailable') return { kind: 'unavailable', code: resolution.code, message: resolution.message }
  const body = resolution.parts.map(({ part, colour, transform }) => {
    const transformAttribute = transform ? ` transform="${escapeAttribute(transform)}"` : ''
    return `<g data-avatar-part="${escapeAttribute(part.id)}"${transformAttribute}>${part.nodes.map((node) => serializeNode(node, colour)).join('')}</g>`
  }).join('')
  const mirrored = resolution.mirrored ? `<g transform="translate(300 0) scale(-1 1)">${body}</g>` : body
  const viewBox = `${AVATAR_VIEW_BOX.x} ${AVATAR_VIEW_BOX.y} ${AVATAR_VIEW_BOX.width} ${AVATAR_VIEW_BOX.height}`
  return {
    kind: 'ready',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${escapeAttribute(title)}"><title>${escapeAttribute(title)}</title>${mirrored}</svg>`,
  }
}
