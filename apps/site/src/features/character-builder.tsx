import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Pencil, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  developmentArtKit,
  developmentDefaultIdentity,
  developmentNeutralAction,
  productionArtKit,
  type CharacterIdentityV1,
  type IdentitySlotId,
  type PaletteId,
} from '@opensymbols/avatar-svg'
import { AvatarSvg } from '@opensymbols/avatar-svg/react'
import {
  ApiError,
  createCharacter,
  deleteCharacter,
  getCharacter,
  getCharacters,
  updateCharacter,
  type CharacterWrite,
  type SavedCharacter,
} from '../api'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  FormActions,
  ResponsiveGrid,
  SectionHeading,
  StatusMessage,
  Surface,
} from '../components/ui'
import { useAppAuth } from './authentication'
import './character-builder.css'

const developmentMode = import.meta.env.DEV
const activeArtKit = developmentMode ? developmentArtKit : productionArtKit

const categories = [
  { id: 'starting', label: 'Starting character' },
  { id: 'face', label: 'Face & skin' },
  { id: 'hair', label: 'Hair' },
  { id: 'clothing', label: 'Body & clothing' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'equipment', label: 'Equipment' },
] as const

type CategoryId = (typeof categories)[number]['id']
type ColourKey = keyof CharacterIdentityV1['colours']

interface Option {
  id: string
  label: string
}

const partOptions = {
  body: [
    { id: 'body-slim', label: 'Slim' },
    { id: 'body-average', label: 'Average' },
    { id: 'body-broad', label: 'Broad' },
  ],
  head: [
    { id: 'head-round', label: 'Round' },
    { id: 'head-oval', label: 'Oval' },
  ],
  face: [
    { id: 'face-soft', label: 'Soft features' },
    { id: 'face-defined', label: 'Defined features' },
  ],
  top: [
    { id: 'top-tshirt', label: 'T-shirt' },
    { id: 'top-jumper', label: 'Jumper' },
  ],
  bottom: [
    { id: 'bottom-trousers', label: 'Trousers' },
    { id: 'bottom-shorts', label: 'Shorts' },
    { id: 'bottom-skirt', label: 'Skirt' },
  ],
  footwear: [
    { id: 'footwear-trainers', label: 'Trainers' },
    { id: 'footwear-boots', label: 'Boots' },
  ],
  glasses: [
    { id: 'none', label: 'No glasses' },
    { id: 'glasses-round', label: 'Round glasses' },
    { id: 'glasses-rectangular', label: 'Rectangular glasses' },
  ],
} as const

const hairOptions = [
  { id: 'none', label: 'No hair', rear: null, front: null },
  { id: 'short', label: 'Short', rear: null, front: 'hair-short-front' },
  { id: 'long', label: 'Long', rear: 'hair-long-rear', front: 'hair-long-front' },
  { id: 'coily', label: 'Coily', rear: 'hair-coily-rear', front: 'hair-coily-front' },
] as const

const hearingOptions = [
  { id: 'none', label: 'No hearing device', left: null, right: null },
  { id: 'left', label: 'Left hearing device', left: 'hearing-left', right: null },
  { id: 'right', label: 'Right hearing device', left: null, right: 'hearing-right' },
  { id: 'bilateral', label: 'Bilateral hearing devices', left: 'hearing-left', right: 'hearing-right' },
] as const

const mobilityOptions = [
  { id: 'none', label: 'No mobility equipment', partId: null },
  { id: 'wheelchair', label: 'Manual wheelchair', partId: 'equipment-wheelchair' },
] as const

function cloneDefaultIdentity(): CharacterIdentityV1 {
  return structuredClone(developmentDefaultIdentity)
}

function sameIdentity(left: CharacterIdentityV1, right: CharacterIdentityV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function characterWrite(name: string, identity: CharacterIdentityV1): CharacterWrite {
  return {
    name: name.trim(),
    template_key: 'modular-svg-avatar',
    template_version: 1,
    configuration_version: 1,
    identity,
  }
}

function selectedHair(identity: CharacterIdentityV1): string {
  return hairOptions.find((option) => option.rear === (identity.selections.rearHair ?? null)
    && option.front === (identity.selections.frontHair ?? null))?.id ?? 'none'
}

function selectedHearing(identity: CharacterIdentityV1): string {
  const selection = identity.sidedSelections.hearingDevice
  return hearingOptions.find((option) => option.left === (selection?.left ?? null)
    && option.right === (selection?.right ?? null))?.id ?? 'none'
}

function paletteOptions(role: ColourKey) {
  return developmentArtKit.palettes.filter((palette) => palette.role === role)
}

function CharacterArtwork({ character, className }: { character: Pick<SavedCharacter, 'name' | 'identity'>; className?: string }) {
  return (
    <AvatarSvg
      className={className}
      artKit={activeArtKit}
      identity={character.identity}
      action={developmentNeutralAction}
      title={`${character.name || 'New character'} preview`}
    />
  )
}

function CharacterPreview({ name, identity }: { name: string; identity: CharacterIdentityV1 }) {
  const description = useMemo(() => {
    const body = partOptions.body.find((option) => option.id === identity.selections.body)?.label ?? 'Unknown build'
    const hair = hairOptions.find((option) => option.id === selectedHair(identity))?.label ?? 'Unknown hair'
    const skin = developmentArtKit.palettes.find((palette) => palette.id === identity.colours.skin)?.label ?? 'Unknown skin tone'
    return `${body} build. ${hair} hair. ${skin} skin tone.`
  }, [identity])
  return (
    <section className="character-editor__preview" aria-labelledby="character-preview-heading">
      <h2 className="visually-hidden" id="character-preview-heading">Character preview</h2>
      <figure>
        <CharacterArtwork character={{ name, identity }} />
        <figcaption aria-live="polite">{description}</figcaption>
      </figure>
    </section>
  )
}

function PartChoices({ legend, name, options, selected, identityFor, onChange }: {
  legend: string
  name: string
  options: readonly Option[]
  selected: string
  identityFor: (id: string) => CharacterIdentityV1
  onChange: (id: string) => void
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="character-editor__choices character-editor__choices--parts">
        {options.map((option) => (
          <label className="character-editor__choice character-editor__part-choice" key={option.id}>
            <input type="radio" name={name} value={option.id} checked={selected === option.id} onChange={() => onChange(option.id)} />
            <AvatarSvg aria-hidden="true" focusable="false" artKit={developmentArtKit} identity={identityFor(option.id)} action={developmentNeutralAction} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ColourChoices({ colourRole, selected, onChange }: { colourRole: ColourKey; selected: PaletteId; onChange: (id: PaletteId) => void }) {
  const options = paletteOptions(colourRole)
  const legend = { skin: 'Skin tone', hair: 'Hair colour', top: 'Top colour', bottom: 'Bottom colour', footwear: 'Footwear colour' }[colourRole]
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="character-editor__choices">
        {options.map((option) => (
          <label className="character-editor__choice" key={option.id}>
            <input type="radio" name={`character-${colourRole}-colour`} value={option.id} checked={selected === option.id} onChange={() => onChange(option.id)} />
            <span className="character-editor__swatch" style={{ backgroundColor: option.value }} aria-hidden="true" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export function CharacterLibraryPage() {
  const auth = useAppAuth()
  const [characters, setCharacters] = useState<SavedCharacter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const [deleting, setDeleting] = useState<SavedCharacter>()
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<Error>()
  const dialogRef = useRef<HTMLDialogElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try { setCharacters(await getCharacters(auth.getToken)) }
    catch (caught) { setError(caught as Error) }
    finally { setLoading(false) }
  }, [auth.getToken])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the route begins an authenticated request lifecycle. */
    void load()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (deleting && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!deleting && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [deleting])

  async function confirmDelete() {
    if (!deleting) return
    const deletedIndex = characters.findIndex((character) => character.id === deleting.id)
    setDeletePending(true)
    setDeleteError(undefined)
    try {
      await deleteCharacter(auth.getToken, deleting.id)
      const remaining = characters.filter((character) => character.id !== deleting.id)
      const next = remaining[Math.min(deletedIndex, remaining.length - 1)]
      setCharacters(remaining)
      setDeleting(undefined)
      window.setTimeout(() => document.getElementById(next ? `character-edit-${next.id}` : 'new-character-link')?.focus(), 0)
    } catch (caught) {
      setDeleteError(caught as Error)
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div className="account-section character-library">
      <SectionHeading title="My characters" description="Create one identity and reuse it across personalised communication symbols." action={<ButtonLink id="new-character-link" to="/account/characters/new" variant="primary">New character</ButtonLink>} />
      {developmentMode && <StatusMessage className="character-development-notice" status="status"><strong>Development art.</strong> These drawings test the modular system and have not been approved by the illustrator.</StatusMessage>}
      {loading && <StatusMessage status="status">Loading your characters…</StatusMessage>}
      {!loading && error && <StatusMessage status="alert"><h2>Characters could not be loaded</h2><p>Try again. Your saved characters have not been changed.</p><Button onClick={() => void load()}>Try again</Button></StatusMessage>}
      {!loading && !error && characters.length === 0 && <EmptyState className="character-library__empty" eyebrow="Character library" badge={<Badge>Ready to create</Badge>} heading="No characters yet" description="Create your first character and it will appear here." />}
      {!loading && !error && characters.length > 0 && (
        <ResponsiveGrid className="character-library__grid">
          {characters.map((character) => (
            <Surface className="character-card" key={character.id}>
              <div className="character-card__preview"><CharacterArtwork character={character} /></div>
              <div className="character-card__content">
                <h3>{character.name}</h3>
                <p><time dateTime={character.updated_at}>Updated {formatUpdatedAt(character.updated_at)}</time></p>
                <FormActions>
                  <ButtonLink id={`character-edit-${character.id}`} to={`/account/characters/${character.id}/edit`}><Pencil aria-hidden="true" focusable="false" size={18} /> Edit</ButtonLink>
                  <Button onClick={() => { setDeleteError(undefined); setDeleting(character) }}><Trash2 aria-hidden="true" focusable="false" size={18} /> Delete</Button>
                </FormActions>
              </div>
            </Surface>
          ))}
        </ResponsiveGrid>
      )}
      <dialog className="character-delete-dialog" ref={dialogRef} aria-labelledby="character-delete-title" onCancel={(event) => { event.preventDefault(); if (!deletePending) setDeleting(undefined) }} onClose={() => { if (!deletePending) setDeleting(undefined) }}>
        <h2 id="character-delete-title">Delete {deleting?.name || 'character'}?</h2>
        <p>This permanently removes the character from your library.</p>
        {deleteError && <StatusMessage status="alert">{deleteError instanceof ApiError && deleteError.code === 'character_has_symbols' ? 'Delete this character’s symbols first.' : 'The character could not be deleted. Try again.'}</StatusMessage>}
        <FormActions><Button disabled={deletePending} onClick={() => setDeleting(undefined)}>Cancel</Button><Button variant="primary" disabled={deletePending} onClick={() => void confirmDelete()}>{deletePending ? 'Deleting…' : 'Delete character'}</Button></FormActions>
      </dialog>
    </div>
  )
}

export function CharacterEditorPage() {
  const auth = useAppAuth()
  const navigate = useNavigate()
  const { characterId } = useParams()
  const [activeCategory, setActiveCategory] = useState<CategoryId>('starting')
  const [name, setName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [editingName, setEditingName] = useState(!characterId)
  const [nameValidationRequested, setNameValidationRequested] = useState(false)
  const [identity, setIdentity] = useState<CharacterIdentityV1>(cloneDefaultIdentity)
  const [history, setHistory] = useState<CharacterIdentityV1[]>([])
  const [savedCharacter, setSavedCharacter] = useState<SavedCharacter>()
  const [loading, setLoading] = useState(Boolean(characterId))
  const [loadError, setLoadError] = useState<Error>()
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'error' | 'conflict'>()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const nameInputRef = useRef<HTMLInputElement>(null)
  const restoreNameFocus = useRef(false)

  const load = useCallback(async () => {
    if (!characterId) return
    setLoading(true)
    setLoadError(undefined)
    try {
      const character = await getCharacter(auth.getToken, characterId)
      setSavedCharacter(character)
      setName(character.name)
      setNameDraft(character.name)
      setEditingName(false)
      setNameValidationRequested(false)
      setIdentity(character.identity)
      setHistory([])
    } catch (caught) { setLoadError(caught as Error) }
    finally { setLoading(false) }
  }, [auth.getToken, characterId])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the route begins an authenticated request lifecycle. */
    void load()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load])

  const baselineIdentity = savedCharacter?.identity ?? developmentDefaultIdentity
  const dirty = name !== (savedCharacter?.name ?? '') || !sameIdentity(identity, baselineIdentity)
  const valid = name.trim().length > 0 && name.trim().length <= 80
  const nameDraftValid = nameDraft.trim().length > 0 && nameDraft.trim().length <= 80
  const hasUnsavedChanges = dirty || (editingName && nameDraft !== name)

  useEffect(() => { if (editingName && !loading) nameInputRef.current?.focus() }, [editingName, loading])
  useEffect(() => {
    if (editingName || !restoreNameFocus.current) return
    restoreNameFocus.current = false
    document.getElementById('character-name-edit')?.focus()
  }, [editingName])
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  function applyIdentity(next: CharacterIdentityV1) {
    if (sameIdentity(next, identity)) return
    setHistory((current) => [...current.slice(-29), structuredClone(identity)])
    setIdentity(next)
    setSaveStatus(undefined)
  }

  function withSelection(slot: IdentitySlotId, partId: string | null): CharacterIdentityV1 {
    return { ...identity, selections: { ...identity.selections, [slot]: partId } }
  }

  function withColour(role: ColourKey, paletteId: string): CharacterIdentityV1 {
    return { ...identity, colours: { ...identity.colours, [role]: paletteId } }
  }

  function resetCategory() {
    const defaults = cloneDefaultIdentity()
    const next = structuredClone(identity)
    if (activeCategory === 'starting') next.selections.body = defaults.selections.body
    if (activeCategory === 'face') {
      next.selections.head = defaults.selections.head
      next.selections.face = defaults.selections.face
      next.colours.skin = defaults.colours.skin
    }
    if (activeCategory === 'hair') {
      next.selections.rearHair = defaults.selections.rearHair
      next.selections.frontHair = defaults.selections.frontHair
      next.colours.hair = defaults.colours.hair
    }
    if (activeCategory === 'clothing') {
      for (const slot of ['top', 'bottom', 'footwear'] as const) next.selections[slot] = defaults.selections[slot]
      for (const role of ['top', 'bottom', 'footwear'] as const) next.colours[role] = defaults.colours[role]
    }
    if (activeCategory === 'accessories') next.selections.glasses = defaults.selections.glasses
    if (activeCategory === 'equipment') {
      next.selections.mobilityEquipment = defaults.selections.mobilityEquipment
      next.sidedSelections.hearingDevice = defaults.sidedSelections.hearingDevice
    }
    applyIdentity(next)
  }

  function undo() {
    const previous = history.at(-1)
    if (!previous) return
    setIdentity(previous)
    setHistory((current) => current.slice(0, -1))
    setSaveStatus(undefined)
  }

  function exitEditor() {
    if (hasUnsavedChanges && !window.confirm('Leave the character editor? Your unsaved changes will be lost.')) return
    navigate('/account/characters')
  }

  function finishNameEditing() {
    if (!nameDraftValid) {
      setNameValidationRequested(true)
      return
    }
    const next = nameDraft.trim()
    setName(next)
    setNameDraft(next)
    setSaveStatus(undefined)
    restoreNameFocus.current = true
    setEditingName(false)
    setNameValidationRequested(false)
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); finishNameEditing() }
    if (event.key === 'Escape') { event.preventDefault(); setNameDraft(name); restoreNameFocus.current = true; setEditingName(false) }
  }

  function selectTab(index: number) {
    const wrapped = (index + categories.length) % categories.length
    setActiveCategory(categories[wrapped]!.id)
    tabRefs.current[wrapped]?.focus()
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const destination = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: categories.length - 1 }[event.key]
    if (destination === undefined) return
    event.preventDefault()
    selectTab(destination)
  }

  async function save() {
    if (!valid || !dirty || saving || activeArtKit.status === 'pending') return
    setSaving(true)
    setSaveStatus(undefined)
    try {
      const write = characterWrite(name, identity)
      const character = savedCharacter
        ? await updateCharacter(auth.getToken, savedCharacter.id, write, savedCharacter.revision)
        : await createCharacter(auth.getToken, write)
      setSavedCharacter(character)
      setName(character.name)
      setNameDraft(character.name)
      setIdentity(character.identity)
      setHistory([])
      setEditingName(false)
      setSaveStatus('saved')
      if (!characterId) navigate(`/account/characters/${character.id}/edit`, { replace: true })
    } catch (caught) {
      setSaveStatus(caught instanceof ApiError && caught.code === 'character_conflict' ? 'conflict' : 'error')
    } finally { setSaving(false) }
  }

  function previewSelection(slot: IdentitySlotId, id: string | null) {
    return { ...identity, selections: { ...identity.selections, [slot]: id } }
  }

  const categoryPanel = (() => {
    if (activeCategory === 'starting') return <PartChoices legend="Body build" name="body-build" options={partOptions.body} selected={identity.selections.body ?? ''} identityFor={(id) => previewSelection('body', id)} onChange={(id) => applyIdentity(withSelection('body', id))} />
    if (activeCategory === 'face') return <>
      <PartChoices legend="Head shape" name="head-shape" options={partOptions.head} selected={identity.selections.head ?? ''} identityFor={(id) => previewSelection('head', id)} onChange={(id) => applyIdentity(withSelection('head', id))} />
      <PartChoices legend="Face style" name="face-style" options={partOptions.face} selected={identity.selections.face ?? ''} identityFor={(id) => previewSelection('face', id)} onChange={(id) => applyIdentity(withSelection('face', id))} />
      <ColourChoices colourRole="skin" selected={identity.colours.skin} onChange={(id) => applyIdentity(withColour('skin', id))} />
    </>
    if (activeCategory === 'hair') return <>
      <PartChoices legend="Hair style" name="hair-style" options={hairOptions} selected={selectedHair(identity)} identityFor={(id) => {
        const option = hairOptions.find((candidate) => candidate.id === id) ?? hairOptions[0]
        return { ...identity, selections: { ...identity.selections, rearHair: option.rear, frontHair: option.front } }
      }} onChange={(id) => {
        const option = hairOptions.find((candidate) => candidate.id === id) ?? hairOptions[0]
        applyIdentity({ ...identity, selections: { ...identity.selections, rearHair: option.rear, frontHair: option.front } })
      }} />
      <ColourChoices colourRole="hair" selected={identity.colours.hair} onChange={(id) => applyIdentity(withColour('hair', id))} />
    </>
    if (activeCategory === 'clothing') return <>
      <PartChoices legend="Top" name="top-style" options={partOptions.top} selected={identity.selections.top ?? ''} identityFor={(id) => previewSelection('top', id)} onChange={(id) => applyIdentity(withSelection('top', id))} />
      <ColourChoices colourRole="top" selected={identity.colours.top} onChange={(id) => applyIdentity(withColour('top', id))} />
      <PartChoices legend="Bottom" name="bottom-style" options={partOptions.bottom} selected={identity.selections.bottom ?? ''} identityFor={(id) => previewSelection('bottom', id)} onChange={(id) => applyIdentity(withSelection('bottom', id))} />
      <ColourChoices colourRole="bottom" selected={identity.colours.bottom} onChange={(id) => applyIdentity(withColour('bottom', id))} />
      <PartChoices legend="Footwear" name="footwear-style" options={partOptions.footwear} selected={identity.selections.footwear ?? ''} identityFor={(id) => previewSelection('footwear', id)} onChange={(id) => applyIdentity(withSelection('footwear', id))} />
      <ColourChoices colourRole="footwear" selected={identity.colours.footwear} onChange={(id) => applyIdentity(withColour('footwear', id))} />
    </>
    if (activeCategory === 'accessories') return <PartChoices legend="Glasses" name="glasses" options={partOptions.glasses} selected={identity.selections.glasses ?? 'none'} identityFor={(id) => previewSelection('glasses', id === 'none' ? null : id)} onChange={(id) => applyIdentity(withSelection('glasses', id === 'none' ? null : id))} />
    return <>
      <PartChoices legend="Hearing devices" name="hearing-device" options={hearingOptions} selected={selectedHearing(identity)} identityFor={(id) => {
        const option = hearingOptions.find((candidate) => candidate.id === id) ?? hearingOptions[0]
        return { ...identity, sidedSelections: { ...identity.sidedSelections, hearingDevice: option.left || option.right ? { left: option.left, right: option.right } : null } }
      }} onChange={(id) => {
        const option = hearingOptions.find((candidate) => candidate.id === id) ?? hearingOptions[0]
        applyIdentity({ ...identity, sidedSelections: { ...identity.sidedSelections, hearingDevice: option.left || option.right ? { left: option.left, right: option.right } : null } })
      }} />
      <PartChoices legend="Mobility equipment" name="mobility-equipment" options={mobilityOptions} selected={identity.selections.mobilityEquipment ? 'wheelchair' : 'none'} identityFor={(id) => previewSelection('mobilityEquipment', mobilityOptions.find((candidate) => candidate.id === id)?.partId ?? null)} onChange={(id) => applyIdentity(withSelection('mobilityEquipment', mobilityOptions.find((candidate) => candidate.id === id)?.partId ?? null))} />
    </>
  })()

  const saveHelp = editingName ? 'Finish editing the character name before saving.' : !valid ? 'Enter a character name between 1 and 80 characters.' : !dirty ? 'No unsaved changes.' : 'Save your changes to your private character library.'

  return (
    <div className="character-editor">
      <header className="character-editor__topbar">
        <div className="character-editor__identity"><strong>Open Symbols</strong><Badge>Development art</Badge></div>
        <div className="character-editor__title">
          <p className="eyebrow">Character builder</p>
          <h1 className="visually-hidden" id="character-editor-title">{characterId ? 'Edit character' : 'New character'}</h1>
          {editingName ? (
            <div className="character-editor__name-editor">
              <label className="visually-hidden" htmlFor="character-name">Character name</label>
              <input ref={nameInputRef} className="field__control character-editor__name-input" id="character-name" required maxLength={80} placeholder="Name this character" value={nameDraft} aria-invalid={nameValidationRequested && !nameDraftValid ? true : undefined} aria-describedby={nameValidationRequested && !nameDraftValid ? 'character-name-error' : undefined} disabled={loading} onBlur={() => setNameValidationRequested(true)} onChange={(event) => { setNameDraft(event.target.value); setNameValidationRequested(false); setSaveStatus(undefined) }} onKeyDown={handleNameKeyDown} />
              <div className="character-editor__name-actions"><Button variant="primary" disabled={!nameDraftValid || loading} onClick={finishNameEditing}>Done</Button><Button disabled={loading} onClick={() => { setNameDraft(name); setNameValidationRequested(false); restoreNameFocus.current = true; setEditingName(false) }}>Cancel</Button></div>
              {nameValidationRequested && !nameDraftValid && <span className="field__error" id="character-name-error">Enter a character name between 1 and 80 characters.</span>}
            </div>
          ) : (
            <div className="character-editor__name-display"><p>{name || 'Name your character'}</p><Button id="character-name-edit" disabled={loading} onClick={() => { setNameDraft(name); setSaveStatus(undefined); setEditingName(true) }}><Pencil aria-hidden="true" focusable="false" size={18} /> Edit name</Button></div>
          )}
        </div>
        <div className="character-editor__actions">
          <Button onClick={exitEditor}><ArrowLeft aria-hidden="true" focusable="false" size={20} /> Exit editor</Button>
          <Button variant="primary" disabled={editingName || !valid || !dirty || saving || loading || activeArtKit.status === 'pending'} aria-describedby="character-save-help" onClick={() => void save()}><Save aria-hidden="true" focusable="false" size={20} />{saving ? 'Saving…' : 'Save character'}</Button>
          <span id="character-save-help">{saveHelp}</span>
        </div>
      </header>

      {developmentMode && <StatusMessage className="character-development-notice" status="status"><strong>Development art, not approved artwork.</strong> This character tests choices, saving and reuse. An illustrator will replace every visible contour.</StatusMessage>}
      {loading ? <StatusMessage className="character-editor__loading" status="status">Loading character…</StatusMessage> : loadError ? (
        <StatusMessage className="character-editor__loading" status="alert"><h2>Character could not be loaded</h2><p>{loadError instanceof ApiError && loadError.status === 404 ? 'This character was not found.' : 'Try loading the character again.'}</p><Button onClick={() => void load()}>Try again</Button></StatusMessage>
      ) : activeArtKit.status === 'pending' ? (
        <StatusMessage className="character-editor__loading" status="alert"><h2>Avatar artwork is not available</h2><p>The production creator will open after the illustrator-approved kit is installed.</p></StatusMessage>
      ) : (
        <section className="character-editor__workspace" aria-labelledby="character-editor-title">
          <nav className="character-editor__parts" aria-label="Character parts"><div role="tablist" aria-label="Character parts">
            {categories.map((category, index) => <button ref={(element) => { tabRefs.current[index] = element }} key={category.id} id={`character-part-${category.id}`} type="button" role="tab" aria-selected={activeCategory === category.id} aria-controls={`character-panel-${category.id}`} tabIndex={activeCategory === category.id ? 0 : -1} onClick={() => setActiveCategory(category.id)} onKeyDown={(event) => handleTabKeyDown(event, index)}>{category.label}</button>)}
          </div></nav>
          <CharacterPreview name={name} identity={identity} />
          <Surface className="character-editor__options" tone="accent" aria-label="Character options">
            {saveStatus === 'saved' && <StatusMessage status="status">Character saved.</StatusMessage>}
            {saveStatus === 'error' && <StatusMessage status="alert">The character could not be saved. Your changes are still here.</StatusMessage>}
            {saveStatus === 'conflict' && <StatusMessage status="alert"><h2>This character changed elsewhere</h2><p>Your changes were not overwritten. Reload the saved version before editing again.</p><Button onClick={() => { setSaveStatus(undefined); void load() }}>Reload saved character</Button></StatusMessage>}
            <div className="character-editor__option-actions"><Button disabled={history.length === 0} onClick={undo}><Undo2 aria-hidden="true" size={18} /> Undo</Button><Button onClick={resetCategory}><RotateCcw aria-hidden="true" size={18} /> Reset category</Button><Button onClick={() => applyIdentity(cloneDefaultIdentity())}>Reset all</Button></div>
            {categories.map((category) => <div key={category.id} id={`character-panel-${category.id}`} role="tabpanel" aria-labelledby={`character-part-${category.id}`} hidden={activeCategory !== category.id}>{activeCategory === category.id ? categoryPanel : null}</div>)}
          </Surface>
        </section>
      )}
    </div>
  )
}
