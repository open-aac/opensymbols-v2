import { createElement, type ReactElement, type SVGProps } from 'react'
import { AVATAR_VIEW_BOX, type AvatarArtKitManifest, type CharacterActionV1, type CharacterIdentityV1, type CompiledSvgNode } from './contracts.js'
import { resolveAvatar } from './resolve.js'

export interface AvatarSvgProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  artKit: AvatarArtKitManifest
  identity: CharacterIdentityV1
  action: CharacterActionV1
  title?: string
}

function renderNode(node: CompiledSvgNode, key: string): ReactElement {
  const children: ReactElement[] | undefined = node.children?.map((child, index) => renderNode(child, `${key}-${index}`))
  const reactAttributeNames: Record<string, string> = {
    'clip-rule': 'clipRule',
    'fill-rule': 'fillRule',
    'stroke-linecap': 'strokeLinecap',
    'stroke-linejoin': 'strokeLinejoin',
    'stroke-width': 'strokeWidth',
    'vector-effect': 'vectorEffect',
  }
  const attributes = Object.fromEntries(Object.entries(node.attributes).map(([name, value]) => [reactAttributeNames[name] ?? name, value]))
  return createElement(node.element, { ...attributes, key }, children)
}

export function AvatarSvg({ artKit, identity, action, title = 'Avatar symbol', ...svgProps }: AvatarSvgProps) {
  const resolution = resolveAvatar(artKit, identity, action)
  const viewBox = `${AVATAR_VIEW_BOX.x} ${AVATAR_VIEW_BOX.y} ${AVATAR_VIEW_BOX.width} ${AVATAR_VIEW_BOX.height}`
  if (resolution.kind === 'unavailable') {
    return (
      <svg {...svgProps} viewBox={viewBox} role="img" aria-label={`${title}: unavailable`} data-avatar-state="unavailable">
        <title>{`${title}: unavailable`}</title>
        <rect x="24" y="110" width="252" height="80" rx="12" fill="#f5f3f0" stroke="#49433f" strokeWidth="3" />
        <text x="150" y="146" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="13" fill="#282422">Avatar art unavailable</text>
        <text x="150" y="168" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="9" fill="#625b56">{resolution.code.replaceAll('_', ' ')}</text>
      </svg>
    )
  }
  const parts = resolution.parts.map(({ part, colour, transform }, partIndex) => (
    <g key={`${part.id}-${partIndex}`} data-avatar-part={part.id} color={colour} transform={transform}>
      {part.nodes.map((node, nodeIndex) => renderNode(node, `${part.id}-${nodeIndex}`))}
    </g>
  ))
  return (
    <svg {...svgProps} xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} role="img" aria-label={title} data-avatar-state="ready">
      <title>{title}</title>
      {resolution.mirrored ? <g transform="translate(300 0) scale(-1 1)">{parts}</g> : parts}
    </svg>
  )
}
