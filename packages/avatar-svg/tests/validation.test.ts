import { describe, expect, it } from 'vitest'
import { compileSvgSource } from '../src/compiler.js'
import { developmentArtKit } from '../src/development-art-kit.js'
import { validateArtKit } from '../src/validation.js'
import { fixtureArtKit } from './fixtures.js'

describe('art-kit compilation and validation', () => {
  it('accepts the complete development art kit', () => {
    expect(validateArtKit(developmentArtKit)).toEqual([])
  })

  it('accepts the isolated engineering fixture', () => {
    expect(validateArtKit(fixtureArtKit)).toEqual([])
  })

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path onclick="alert(1)" d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://example.com/a.svg#x)" d="M0 0"/></svg>',
  ])('rejects unsafe authoring SVG', (source) => {
    expect(() => compileSvgSource(source)).toThrow()
  })

  it('rejects duplicate IDs and broken compatibility references', () => {
    const badKit = {
      ...fixtureArtKit,
      parts: [
        ...fixtureArtKit.parts,
        { ...fixtureArtKit.parts[0]!, compatibility: { partIds: ['missing-part'] } },
      ],
    }
    const codes = validateArtKit(badKit).map((issue) => issue.code)
    expect(codes).toContain('duplicate_part_id')
    expect(codes).toContain('unknown_compatible_part')
  })

  it('rejects invalid bounds, connectors, colour roles, and action references', () => {
    const sourcePart = fixtureArtKit.parts[0]!
    const badKit = {
      ...fixtureArtKit,
      parts: [{
        ...sourcePart,
        colourRole: 'unknown',
        bounds: { x: -1, y: 0, width: 400, height: 10 },
        connectors: [{ ...sourcePart.connectors[0]!, x: 999, overlap: 9 }],
      }],
      actions: [{
        id: 'wave', label: 'Wave', placements: [{ partId: 'missing-part' }],
        expressionParts: { neutral: 'missing-face' },
        leftHandParts: { relaxed: 'missing-left-hand' },
        rightHandParts: { open: 'missing-right-hand' },
      }],
    } as unknown as typeof fixtureArtKit
    const codes = validateArtKit(badKit).map((issue) => issue.code)
    expect(codes).toEqual(expect.arrayContaining([
      'invalid_colour_role', 'bounds_outside_viewbox', 'connector_outside_bounds',
      'invalid_connector_contract', 'unknown_action_part', 'unknown_action_variant_part',
    ]))
  })

  it('rejects equipment compositions with missing source, replacement, or companion parts', () => {
    const badKit = {
      ...fixtureArtKit,
      equipmentCompositions: [{
        equipmentPartId: 'missing-equipment',
        replacements: { body: { 'missing-source': 'missing-replacement' } },
        placements: [{ partId: 'missing-companion' }],
      }],
    }
    const codes = validateArtKit(badKit).map((issue) => issue.code)
    expect(codes).toEqual(expect.arrayContaining([
      'unknown_equipment_composition',
      'unknown_equipment_replacement',
      'unknown_equipment_placement',
    ]))
  })

  it('rejects modular part compositions with missing triggers or parts', () => {
    const badKit = {
      ...fixtureArtKit,
      partCompositions: [{
        triggerPartId: 'missing-trigger',
        placements: [{ partId: 'missing-arm' }],
      }],
    }
    const codes = validateArtKit(badKit).map((issue) => issue.code)
    expect(codes).toEqual(expect.arrayContaining([
      'unknown_composition_trigger',
      'unknown_composition_part',
    ]))
  })
})
