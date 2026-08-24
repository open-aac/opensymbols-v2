import {
  AVATAR_LAYERS,
  AVATAR_VIEW_BOX,
  type AvatarArtKitManifest,
  type ColourRole,
  type CompiledSvgNode,
  type ValidationIssue,
} from './contracts.js'

const allowedElements = new Set(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
const allowedAttributes = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height',
  'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule',
  'clip-rule', 'opacity', 'transform', 'vector-effect',
])
const colourRoles = new Set<ColourRole>([
  'skin', 'hair', 'top', 'bottom', 'footwear', 'outline', 'detail', 'equipment',
])
const safeColour = /^(#[0-9a-f]{6}|#[0-9a-f]{8})$/i
const unsafeValue = /(?:url\s*\(|javascript:|data:|https?:|<|>)/i

function finite(value: number): boolean {
  return Number.isFinite(value)
}

function inspectNode(node: CompiledSvgNode, path: string, issues: ValidationIssue[]): void {
  if (!allowedElements.has(node.element)) {
    issues.push({ code: 'unsafe_svg_element', path, message: `Element ${node.element} is not allowed.` })
  }
  for (const [name, value] of Object.entries(node.attributes)) {
    if (!allowedAttributes.has(name) || name.startsWith('on')) {
      issues.push({ code: 'unsafe_svg_attribute', path: `${path}.attributes.${name}`, message: `Attribute ${name} is not allowed.` })
    }
    if (unsafeValue.test(String(value))) {
      issues.push({ code: 'external_svg_reference', path: `${path}.attributes.${name}`, message: 'External or executable SVG values are not allowed.' })
    }
  }
  node.children?.forEach((child, index) => inspectNode(child, `${path}.children[${index}]`, issues))
}

function duplicates(values: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return repeated
}

export function validateArtKit(manifest: AvatarArtKitManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!Number.isInteger(manifest.version) || manifest.version < 1) {
    issues.push({ code: 'invalid_version', path: 'version', message: 'Art-kit version must be a positive integer.' })
  }

  for (const id of duplicates(manifest.parts.map((part) => part.id))) {
    issues.push({ code: 'duplicate_part_id', path: 'parts', message: `Duplicate part ID: ${id}.` })
  }
  for (const id of duplicates(manifest.actions.map((action) => action.id))) {
    issues.push({ code: 'duplicate_action_id', path: 'actions', message: `Duplicate action ID: ${id}.` })
  }
  for (const id of duplicates(manifest.palettes.map((palette) => palette.id))) {
    issues.push({ code: 'duplicate_palette_id', path: 'palettes', message: `Duplicate palette ID: ${id}.` })
  }

  const partIds = new Set(manifest.parts.map((part) => part.id))
  const actionIds = new Set(manifest.actions.map((action) => action.id))
  for (const [index, palette] of manifest.palettes.entries()) {
    if (!colourRoles.has(palette.role)) {
      issues.push({ code: 'invalid_colour_role', path: `palettes[${index}].role`, message: `Unknown colour role: ${palette.role}.` })
    }
    if (!safeColour.test(palette.value)) {
      issues.push({ code: 'invalid_palette_value', path: `palettes[${index}].value`, message: 'Palette values must be six- or eight-digit hexadecimal colours.' })
    }
  }

  for (const [index, part] of manifest.parts.entries()) {
    const path = `parts[${index}]`
    const bounds = part.bounds
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(finite) || bounds.width <= 0 || bounds.height <= 0) {
      issues.push({ code: 'invalid_bounds', path: `${path}.bounds`, message: 'Bounds must contain finite coordinates and positive dimensions.' })
    } else if (
      bounds.x < AVATAR_VIEW_BOX.x || bounds.y < AVATAR_VIEW_BOX.y ||
      bounds.x + bounds.width > AVATAR_VIEW_BOX.width || bounds.y + bounds.height > AVATAR_VIEW_BOX.height
    ) {
      issues.push({ code: 'bounds_outside_viewbox', path: `${path}.bounds`, message: 'Part bounds must remain inside the 300 × 300 artboard.' })
    }
    if (!colourRoles.has(part.colourRole)) {
      issues.push({ code: 'invalid_colour_role', path: `${path}.colourRole`, message: `Unknown colour role: ${part.colourRole}.` })
    }
    if (!AVATAR_LAYERS.includes(part.layer)) {
      issues.push({ code: 'invalid_layer', path: `${path}.layer`, message: `Unknown layer: ${part.layer}.` })
    }
    if (part.nodes.length === 0) {
      issues.push({ code: 'empty_part', path: `${path}.nodes`, message: 'A visible part must contain at least one SVG node.' })
    }
    for (const connectorId of duplicates(part.connectors.map((connector) => connector.id))) {
      issues.push({ code: 'duplicate_connector_id', path: `${path}.connectors`, message: `Duplicate connector ID: ${connectorId}.` })
    }
    part.connectors.forEach((connector, connectorIndex) => {
      const connectorPath = `${path}.connectors[${connectorIndex}]`
      if (![connector.x, connector.y, connector.directionDegrees, connector.seamWidth, connector.overlap].every(finite)) {
        issues.push({ code: 'invalid_connector', path: connectorPath, message: 'Connector values must be finite.' })
      }
      if (connector.x < bounds.x || connector.x > bounds.x + bounds.width || connector.y < bounds.y || connector.y > bounds.y + bounds.height) {
        issues.push({ code: 'connector_outside_bounds', path: connectorPath, message: 'Connector point must be inside the declared part bounds.' })
      }
      if (connector.seamWidth <= 0 || connector.overlap < 2 || connector.overlap > 6 || !connector.connectorClass.trim()) {
        issues.push({ code: 'invalid_connector_contract', path: connectorPath, message: 'Connectors need a class, positive seam width, and 2–6 units of overlap.' })
      }
    })
    part.compatibility?.partIds?.forEach((id) => {
      if (!partIds.has(id)) issues.push({ code: 'unknown_compatible_part', path: `${path}.compatibility.partIds`, message: `Unknown compatible part: ${id}.` })
    })
    part.compatibility?.actionIds?.forEach((id) => {
      if (!actionIds.has(id)) issues.push({ code: 'unknown_compatible_action', path: `${path}.compatibility.actionIds`, message: `Unknown compatible action: ${id}.` })
    })
    part.nodes.forEach((node, nodeIndex) => inspectNode(node, `${path}.nodes[${nodeIndex}]`, issues))
  }

  manifest.actions.forEach((action, index) => {
    action.placements.forEach((placement, placementIndex) => {
      if (!partIds.has(placement.partId)) {
        issues.push({ code: 'unknown_action_part', path: `actions[${index}].placements[${placementIndex}]`, message: `Unknown action part: ${placement.partId}.` })
      }
      if (placement.transform && unsafeValue.test(placement.transform)) {
        issues.push({ code: 'unsafe_transform', path: `actions[${index}].placements[${placementIndex}].transform`, message: 'Transform contains an unsafe value.' })
      }
    })
    const variantMaps = [action.expressionParts, action.leftHandParts, action.rightHandParts, action.propParts, action.equipmentParts]
    variantMaps.forEach((variants, variantIndex) => {
      for (const partId of Object.values(variants ?? {})) {
        if (!partIds.has(partId)) issues.push({ code: 'unknown_action_variant_part', path: `actions[${index}].variants[${variantIndex}]`, message: `Unknown action variant part: ${partId}.` })
      }
    })
    if (Object.keys(action.expressionParts).length === 0 || Object.keys(action.leftHandParts).length === 0 || Object.keys(action.rightHandParts).length === 0) {
      issues.push({ code: 'missing_action_variants', path: `actions[${index}]`, message: 'Actions must declare supported expressions and left and right hands.' })
    }
  })

  for (const [index, composition] of (manifest.equipmentCompositions ?? []).entries()) {
    const path = `equipmentCompositions[${index}]`
    if (!partIds.has(composition.equipmentPartId)) {
      issues.push({ code: 'unknown_equipment_composition', path: `${path}.equipmentPartId`, message: `Unknown equipment part: ${composition.equipmentPartId}.` })
    }
    for (const [slot, replacements] of Object.entries(composition.replacements)) {
      for (const [sourceId, replacementId] of Object.entries(replacements ?? {})) {
        if (!partIds.has(sourceId) || !partIds.has(replacementId)) {
          issues.push({ code: 'unknown_equipment_replacement', path: `${path}.replacements.${slot}`, message: `Unknown equipment replacement: ${sourceId} -> ${replacementId}.` })
        }
      }
    }
    for (const [placementIndex, placement] of (composition.placements ?? []).entries()) {
      if (!partIds.has(placement.partId)) {
        issues.push({ code: 'unknown_equipment_placement', path: `${path}.placements[${placementIndex}]`, message: `Unknown equipment placement: ${placement.partId}.` })
      }
    }
    for (const [name, transform] of [['leftHandTransform', composition.leftHandTransform], ['rightHandTransform', composition.rightHandTransform]] as const) {
      if (transform && unsafeValue.test(transform)) {
        issues.push({ code: 'unsafe_transform', path: `${path}.${name}`, message: 'Transform contains an unsafe value.' })
      }
    }
  }

  for (const [index, composition] of (manifest.partCompositions ?? []).entries()) {
    const path = `partCompositions[${index}]`
    if (!partIds.has(composition.triggerPartId)) {
      issues.push({ code: 'unknown_composition_trigger', path: `${path}.triggerPartId`, message: `Unknown composition trigger: ${composition.triggerPartId}.` })
    }
    for (const [placementIndex, placement] of composition.placements.entries()) {
      if (!partIds.has(placement.partId)) {
        issues.push({ code: 'unknown_composition_part', path: `${path}.placements[${placementIndex}]`, message: `Unknown composition part: ${placement.partId}.` })
      }
      if (placement.transform && unsafeValue.test(placement.transform)) {
        issues.push({ code: 'unsafe_transform', path: `${path}.placements[${placementIndex}].transform`, message: 'Transform contains an unsafe value.' })
      }
    }
  }

  if (manifest.status !== 'pending' && (manifest.parts.length === 0 || manifest.actions.length === 0)) {
    issues.push({ code: 'usable_kit_incomplete', path: 'status', message: 'A development or approved art kit must contain parts and actions.' })
  }
  return issues
}

export function assertValidArtKit(manifest: AvatarArtKitManifest): void {
  const issues = validateArtKit(manifest)
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'))
  }
}
