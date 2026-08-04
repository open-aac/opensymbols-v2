import characterTemplate from '../assets/characters/base-character-prototype.svg?raw'
import { describe, expect, it } from 'vitest'
import { applyCharacterColours, hairColourOptions, shirtColourOptions } from './character-template'

function parse(source: string) {
  return new DOMParser().parseFromString(source, 'image/svg+xml')
}

describe('character template colours', () => {
  it('updates every labelled skin, hair, and shirt fill while preserving the artwork', () => {
    const original = parse(characterTemplate)
    const result = applyCharacterColours(characterTemplate, {
      skinColour: '#4a2b20',
      hairColour: '#8a3f24',
      shirtColour: '#3f6fb5',
    })
    const updated = parse(result.svg)
    const skinRegions = Array.from(updated.querySelectorAll<SVGElement>('[id^="skincolor-"]'))
    const hairRegions = Array.from(updated.querySelectorAll<SVGElement>('[id^="haircolor-"]'))
    const shirtRegions = Array.from(updated.querySelectorAll<SVGElement>('[id^="primarycolor-"]'))

    expect(result.skinRegionCount).toBe(8)
    expect(result.hairRegionCount).toBe(1)
    expect(result.shirtRegionCount).toBe(1)
    expect(skinRegions).toHaveLength(8)
    expect(hairRegions).toHaveLength(1)
    expect(shirtRegions).toHaveLength(1)
    expect(skinRegions.every((region) => region.style.fill === 'rgb(74, 43, 32)')).toBe(true)
    expect(hairRegions.every((region) => region.style.fill === 'rgb(138, 63, 36)')).toBe(true)
    expect(shirtRegions.every((region) => region.style.fill === 'rgb(63, 111, 181)')).toBe(true)
    expect(updated.documentElement.getAttribute('viewBox')).toBe(original.documentElement.getAttribute('viewBox'))
    expect(Array.from(updated.querySelectorAll('[id]'), (element) => element.id)).toEqual(
      Array.from(original.querySelectorAll('[id]'), (element) => element.id),
    )
    expect(Array.from(updated.querySelectorAll('[d]'), (element) => element.getAttribute('d'))).toEqual(
      Array.from(original.querySelectorAll('[d]'), (element) => element.getAttribute('d')),
    )
    expect(updated.querySelector('#skincolor-head')?.getAttribute('stroke')).toBe(
      original.querySelector('#skincolor-head')?.getAttribute('stroke'),
    )
    expect(updated.querySelector<SVGElement>('#path58')?.style.fill).toBe(
      original.querySelector<SVGElement>('#path58')?.style.fill,
    )
  })

  it('removes active content, event handlers, and external references', () => {
    const unsafe = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <script>alert(1)</script>
      <style>@import url(https://example.test/styles.css)</style>
      <image href="https://example.test/person.png" />
      <use href="#local-shape" />
      <path id="skincolor-face" onclick="alert(1)" style="fill:#ffffff" d="M0 0" />
    </svg>`
    const labelled = unsafe.replace('</svg>', '<path id="haircolor-hair" style="fill:#000000" /><path id="primarycolor-shirt" style="fill:#ffffff" /></svg>')
    const result = applyCharacterColours(labelled, {
      skinColour: '#ae724c',
      hairColour: '#17120f',
      shirtColour: '#c83e4d',
    })
    const updated = parse(result.svg)

    expect(updated.querySelector('script, style')).toBeNull()
    expect(updated.documentElement.hasAttribute('onload')).toBe(false)
    expect(updated.querySelector('#skincolor-face')?.hasAttribute('onclick')).toBe(false)
    expect(updated.querySelector('image')?.hasAttribute('href')).toBe(false)
    expect(updated.querySelector('use')?.getAttribute('href')).toBe('#local-shape')
  })

  it('supports every curated hair preset', () => {
    for (const option of hairColourOptions) {
      const result = applyCharacterColours(characterTemplate, {
        skinColour: '#c88b6c',
        hairColour: option.value,
        shirtColour: '#af76ed',
      })
      expect(parse(result.svg).querySelector<SVGElement>('#haircolor-hair')?.style.fill).toBeTruthy()
    }
  })

  it('supports every curated shirt preset', () => {
    for (const option of shirtColourOptions) {
      const result = applyCharacterColours(characterTemplate, {
        skinColour: '#c88b6c',
        hairColour: '#211111',
        shirtColour: option.value,
      })
      expect(parse(result.svg).querySelector<SVGElement>('#primarycolor-shirt')?.style.fill).toBeTruthy()
    }
  })

  it('rejects malformed templates, missing labelled regions, and arbitrary colour values', () => {
    const colours = { skinColour: '#ae724c', hairColour: '#17120f', shirtColour: '#af76ed' }
    expect(() => applyCharacterColours('<svg><path></svg>', colours)).toThrow('not valid SVG')
    expect(() => applyCharacterColours('<svg xmlns="http://www.w3.org/2000/svg"/>', colours)).toThrow(
      'does not define any skin colour regions',
    )
    expect(() => applyCharacterColours(
      '<svg xmlns="http://www.w3.org/2000/svg"><path id="skincolor-face" /></svg>',
      colours,
    )).toThrow('does not define any hair colour regions')
    expect(() => applyCharacterColours(
      '<svg xmlns="http://www.w3.org/2000/svg"><path id="skincolor-face" /><path id="haircolor-hair" /></svg>',
      colours,
    )).toThrow('does not define any shirt colour regions')
    expect(() => applyCharacterColours(characterTemplate, {
      skinColour: 'red; background: url(example)',
      hairColour: '#17120f',
      shirtColour: '#af76ed',
    })).toThrow(
      'six-digit hexadecimal colour',
    )
    expect(() => applyCharacterColours(characterTemplate, {
      skinColour: '#ae724c',
      hairColour: 'red; background: url(example)',
      shirtColour: '#af76ed',
    })).toThrow('six-digit hexadecimal colour')
    expect(() => applyCharacterColours(characterTemplate, {
      skinColour: '#ae724c',
      hairColour: '#17120f',
      shirtColour: 'red; background: url(example)',
    })).toThrow('six-digit hexadecimal colour')
  })
})
