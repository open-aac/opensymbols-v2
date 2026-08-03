import characterTemplate from '../assets/characters/base-character-prototype.svg?raw'
import { describe, expect, it } from 'vitest'
import { applyCharacterSkinColour } from './character-template'

function parse(source: string) {
  return new DOMParser().parseFromString(source, 'image/svg+xml')
}

describe('character template skin colours', () => {
  it('updates every labelled skin fill while preserving the artwork', () => {
    const original = parse(characterTemplate)
    const result = applyCharacterSkinColour(characterTemplate, '#4a2b20')
    const updated = parse(result.svg)
    const skinRegions = Array.from(updated.querySelectorAll<SVGElement>('[id^="skincolor-"]'))

    expect(result.skinRegionCount).toBe(8)
    expect(skinRegions).toHaveLength(8)
    expect(skinRegions.every((region) => region.style.fill === 'rgb(74, 43, 32)')).toBe(true)
    expect(updated.documentElement.getAttribute('viewBox')).toBe(original.documentElement.getAttribute('viewBox'))
    expect(Array.from(updated.querySelectorAll('[id]'), (element) => element.id)).toEqual(
      Array.from(original.querySelectorAll('[id]'), (element) => element.id),
    )
    expect(Array.from(updated.querySelectorAll('[d]'), (element) => element.getAttribute('d'))).toEqual(
      Array.from(original.querySelectorAll('[d]'), (element) => element.getAttribute('d')),
    )
    expect(updated.querySelector<SVGElement>('#haircolor-hair')?.style.fill).toBe(
      original.querySelector<SVGElement>('#haircolor-hair')?.style.fill,
    )
    expect(updated.querySelector<SVGElement>('#primarycolor-shirt')?.style.fill).toBe(
      original.querySelector<SVGElement>('#primarycolor-shirt')?.style.fill,
    )
    expect(updated.querySelector('#skincolor-head')?.getAttribute('stroke')).toBe(
      original.querySelector('#skincolor-head')?.getAttribute('stroke'),
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
    const result = applyCharacterSkinColour(unsafe, '#ae724c')
    const updated = parse(result.svg)

    expect(updated.querySelector('script, style')).toBeNull()
    expect(updated.documentElement.hasAttribute('onload')).toBe(false)
    expect(updated.querySelector('#skincolor-face')?.hasAttribute('onclick')).toBe(false)
    expect(updated.querySelector('image')?.hasAttribute('href')).toBe(false)
    expect(updated.querySelector('use')?.getAttribute('href')).toBe('#local-shape')
  })

  it('rejects malformed templates, missing skin regions, and arbitrary colour values', () => {
    expect(() => applyCharacterSkinColour('<svg><path></svg>', '#ae724c')).toThrow('not valid SVG')
    expect(() => applyCharacterSkinColour('<svg xmlns="http://www.w3.org/2000/svg"/>', '#ae724c')).toThrow(
      'does not define any skin colour regions',
    )
    expect(() => applyCharacterSkinColour(characterTemplate, 'red; background: url(example)')).toThrow(
      'six-digit hexadecimal colour',
    )
  })
})
