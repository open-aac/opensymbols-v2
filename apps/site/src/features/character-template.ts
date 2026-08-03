const unsafeElements = 'script, style, foreignObject, iframe, object, embed, link, animate, animateMotion, animateTransform, set'
const skinRegionSelector = '[id^="skincolor-"]'
const hairRegionSelector = '[id^="haircolor-"]'
const shirtRegionSelector = '[id^="primarycolor-"]'
const hexColour = /^#[0-9a-f]{6}$/i

export const skinColourOptions = [
  { id: 'original', label: 'Artist original', value: '#c88b6c' },
  { id: 'light', label: 'Light', value: '#f3d2b3' },
  { id: 'medium-light', label: 'Medium light', value: '#d7a77b' },
  { id: 'medium', label: 'Medium', value: '#ae724c' },
  { id: 'medium-dark', label: 'Medium dark', value: '#7a4930' },
  { id: 'dark', label: 'Dark', value: '#4a2b20' },
] as const

export const hairColourOptions = [
  { id: 'original', label: 'Artist original', value: '#211111' },
  { id: 'black', label: 'Black', value: '#17120f' },
  { id: 'dark-brown', label: 'Dark brown', value: '#3b2518' },
  { id: 'brown', label: 'Brown', value: '#6b4423' },
  { id: 'light-brown', label: 'Light brown', value: '#a66a3f' },
  { id: 'blond', label: 'Blond', value: '#d6b36a' },
  { id: 'auburn', label: 'Auburn', value: '#8a3f24' },
  { id: 'grey', label: 'Grey', value: '#77736f' },
  { id: 'white', label: 'White', value: '#e8e2d8' },
] as const

export const shirtColourOptions = [
  { id: 'original', label: 'Artist original', value: '#af76ed' },
  { id: 'black', label: 'Black', value: '#222222' },
  { id: 'white', label: 'White', value: '#f5f5f2' },
  { id: 'grey', label: 'Grey', value: '#77736f' },
  { id: 'red', label: 'Red', value: '#c83e4d' },
  { id: 'orange', label: 'Orange', value: '#d97828' },
  { id: 'yellow', label: 'Yellow', value: '#d6b84a' },
  { id: 'green', label: 'Green', value: '#3f7d4a' },
  { id: 'blue', label: 'Blue', value: '#3f6fb5' },
  { id: 'purple', label: 'Purple', value: '#7a4eab' },
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
  hairRegionCount: number
  shirtRegionCount: number
}

/**
 * Sanitizes a reviewed character template and updates only artist-labelled colour fills.
 * Other presentation attributes, including outlines and strokes, are preserved.
 */
export function applyCharacterColours(
  source: string,
  colours: { skinColour: string; hairColour: string; shirtColour: string },
): CharacterTemplateResult {
  const { skinColour, hairColour, shirtColour } = colours
  if (!hexColour.test(skinColour)) throw new Error('Skin colour must be a six-digit hexadecimal colour.')
  if (!hexColour.test(hairColour)) throw new Error('Hair colour must be a six-digit hexadecimal colour.')
  if (!hexColour.test(shirtColour)) throw new Error('Shirt colour must be a six-digit hexadecimal colour.')

  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('Character template is not valid SVG.')
  }

  sanitizeSvg(document)
  const skinRegions = Array.from(document.querySelectorAll<SVGElement>(skinRegionSelector))
  const hairRegions = Array.from(document.querySelectorAll<SVGElement>(hairRegionSelector))
  const shirtRegions = Array.from(document.querySelectorAll<SVGElement>(shirtRegionSelector))
  if (!skinRegions.length) throw new Error('Character template does not define any skin colour regions.')
  if (!hairRegions.length) throw new Error('Character template does not define any hair colour regions.')
  if (!shirtRegions.length) throw new Error('Character template does not define any shirt colour regions.')

  skinRegions.forEach((region) => region.style.setProperty('fill', skinColour))
  hairRegions.forEach((region) => region.style.setProperty('fill', hairColour))
  shirtRegions.forEach((region) => region.style.setProperty('fill', shirtColour))

  return {
    svg: new XMLSerializer().serializeToString(document.documentElement),
    skinRegionCount: skinRegions.length,
    hairRegionCount: hairRegions.length,
    shirtRegionCount: shirtRegions.length,
  }
}
