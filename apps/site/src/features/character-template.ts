const unsafeElements = 'script, style, foreignObject, iframe, object, embed, link, animate, animateMotion, animateTransform, set'
const skinRegionSelector = '[id^="skincolor-"]'
const hexColour = /^#[0-9a-f]{6}$/i

export const skinColourOptions = [
  { id: 'original', label: 'Artist original', value: '#c88b6c' },
  { id: 'light', label: 'Light', value: '#f3d2b3' },
  { id: 'medium-light', label: 'Medium light', value: '#d7a77b' },
  { id: 'medium', label: 'Medium', value: '#ae724c' },
  { id: 'medium-dark', label: 'Medium dark', value: '#7a4930' },
  { id: 'dark', label: 'Dark', value: '#4a2b20' },
] as const

function containsExternalReference(value: string) {
  const normalized = value.trim()
  return /^(?:https?:|\/\/|data:|javascript:)/i.test(normalized)
    || /url\(\s*["']?(?!#)/i.test(normalized)
}

function sanitizeSvg(document: XMLDocument) {
  document.querySelectorAll(unsafeElements).forEach((element) => element.remove())

  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name)
        continue
      }

      if ((name === 'href' || name.endsWith(':href')) && !attribute.value.trim().startsWith('#')) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (containsExternalReference(attribute.value)) element.removeAttribute(attribute.name)
    }
  })
}

export interface CharacterTemplateResult {
  svg: string
  skinRegionCount: number
}

/**
 * Sanitizes a reviewed character template and updates only artist-labelled skin fills.
 * Other presentation attributes, including outlines and strokes, are preserved.
 */
export function applyCharacterSkinColour(source: string, skinColour: string): CharacterTemplateResult {
  if (!hexColour.test(skinColour)) throw new Error('Skin colour must be a six-digit hexadecimal colour.')

  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('Character template is not valid SVG.')
  }

  sanitizeSvg(document)
  const skinRegions = Array.from(document.querySelectorAll<SVGElement>(skinRegionSelector))
  if (!skinRegions.length) throw new Error('Character template does not define any skin colour regions.')

  skinRegions.forEach((region) => region.style.setProperty('fill', skinColour))

  return {
    svg: new XMLSerializer().serializeToString(document.documentElement),
    skinRegionCount: skinRegions.length,
  }
}
