import {
  AVATAR_LAYERS,
  IDENTITY_SLOTS,
  type AvatarArtKitManifest,
  type AvatarResolution,
  type CharacterActionV1,
  type CharacterIdentityV1,
  type ColourRole,
  type PaletteDefinition,
  type PartId,
  type ResolvedPart,
  type SvgPartDefinition,
} from './contracts.js'

function selectedPaletteId(identity: CharacterIdentityV1, role: ColourRole): string | undefined {
  if (role === 'skin') return identity.colours.skin
  if (role === 'hair') return identity.colours.hair
  if (role === 'top') return identity.colours.top
  if (role === 'bottom') return identity.colours.bottom
  if (role === 'footwear') return identity.colours.footwear
  return undefined
}

function resolveColour(
  palettes: readonly PaletteDefinition[],
  identity: CharacterIdentityV1,
  role: ColourRole,
): string | undefined {
  const requestedId = selectedPaletteId(identity, role)
  if (requestedId) return palettes.find((palette) => palette.id === requestedId && palette.role === role)?.value
  return palettes.find((palette) => palette.role === role)?.value
}

export function resolveAvatar(
  manifest: AvatarArtKitManifest,
  identity: CharacterIdentityV1,
  action: CharacterActionV1,
): AvatarResolution {
  if (manifest.status === 'pending') {
    return { kind: 'unavailable', code: 'art_kit_pending', message: 'The production avatar art kit has not been approved yet.' }
  }
  if (identity.artKitVersion !== manifest.version) {
    return { kind: 'unavailable', code: 'art_kit_version_mismatch', message: 'This character uses a different art-kit version.' }
  }
  const actionDefinition = manifest.actions.find((candidate) => candidate.id === action.actionId)
  if (!actionDefinition) return { kind: 'unavailable', code: 'action_missing', message: `Action ${action.actionId} is unavailable.` }

  const partMap = new Map(manifest.parts.map((part) => [part.id, part]))
  const candidates: Array<{ id: PartId; transform?: string }> = []
  for (const slot of IDENTITY_SLOTS) {
    const id = identity.selections[slot]
    if (id) candidates.push({ id, transform: actionDefinition.identityTransforms?.[slot] })
  }
  for (const selection of [identity.sidedSelections.hearingDevice, identity.sidedSelections.arm, identity.sidedSelections.leg]) {
    if (selection?.left) candidates.push({ id: selection.left })
    if (selection?.right) candidates.push({ id: selection.right })
  }
  candidates.push(...actionDefinition.placements.map((placement) => ({ id: placement.partId, ...(placement.transform ? { transform: placement.transform } : {}) })))

  const variants = [
    actionDefinition.expressionParts[action.expressionId],
    actionDefinition.leftHandParts[action.leftHandId],
    actionDefinition.rightHandParts[action.rightHandId],
    action.propId ? actionDefinition.propParts?.[action.propId] : undefined,
    action.equipmentOverrideId ? actionDefinition.equipmentParts?.[action.equipmentOverrideId] : undefined,
  ]
  for (const id of variants) if (id) candidates.push({ id })

  const missingVariants = [
    actionDefinition.expressionParts[action.expressionId] ? undefined : action.expressionId,
    actionDefinition.leftHandParts[action.leftHandId] ? undefined : action.leftHandId,
    actionDefinition.rightHandParts[action.rightHandId] ? undefined : action.rightHandId,
    action.propId && !actionDefinition.propParts?.[action.propId] ? action.propId : undefined,
    action.equipmentOverrideId && !actionDefinition.equipmentParts?.[action.equipmentOverrideId] ? action.equipmentOverrideId : undefined,
  ].filter((id): id is string => Boolean(id))
  if (missingVariants.length > 0) {
    return { kind: 'unavailable', code: 'part_missing', message: 'This action does not support one or more selected variants.', missingIds: missingVariants }
  }

  const missingParts = candidates.map(({ id }) => id).filter((id) => !partMap.has(id))
  if (missingParts.length > 0) {
    return { kind: 'unavailable', code: 'part_missing', message: 'One or more selected avatar parts are unavailable.', missingIds: [...new Set(missingParts)] }
  }

  const resolved: ResolvedPart[] = []
  const missingPalettes = new Set<string>()
  for (const candidate of candidates) {
    const part = partMap.get(candidate.id) as SvgPartDefinition
    const colour = resolveColour(manifest.palettes, identity, part.colourRole)
    if (!colour) {
      missingPalettes.add(selectedPaletteId(identity, part.colourRole) ?? part.colourRole)
      continue
    }
    resolved.push({ part, colour, ...(candidate.transform ? { transform: candidate.transform } : {}) })
  }
  if (missingPalettes.size > 0) {
    return { kind: 'unavailable', code: 'palette_missing', message: 'One or more selected colours are unavailable.', missingIds: [...missingPalettes] }
  }

  resolved.sort((left, right) => AVATAR_LAYERS.indexOf(left.part.layer) - AVATAR_LAYERS.indexOf(right.part.layer))
  return { kind: 'ready', parts: resolved, mirrored: action.mirrored }
}
