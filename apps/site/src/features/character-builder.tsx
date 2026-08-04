import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ArrowLeft, Pencil, Save, Trash2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  createCharacter,
  deleteCharacter,
  getCharacter,
  getCharacters,
  updateCharacter,
  type CharacterHairColour,
  type CharacterShirtColour,
  type CharacterSkinColour,
  type CharacterWrite,
  type SavedCharacter,
} from '../api'
import characterTemplate from '../assets/characters/base-character-prototype.svg?raw'
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
import { applyCharacterColours, hairColourOptions, shirtColourOptions, skinColourOptions } from './character-template'
import { useAppAuth } from './authentication'
import './character-builder.css'

const characterParts = [
  { id: 'skin', label: 'Skin', description: 'Choose the skin colour used by every artist-labelled skin region.' },
  { id: 'hair', label: 'Hair', description: 'Choose the colour used by every artist-labelled hair region.' },
  { id: 'face', label: 'Face', description: 'Facial features and expressions will be added here in a later increment.' },
  { id: 'clothing', label: 'Clothing', description: 'Choose the shirt colour used by every artist-labelled primary colour region.' },
  { id: 'mobility', label: 'Mobility & body', description: 'Mobility aids, limb differences, and body options will be added here in a later increment.' },
  { id: 'accessories', label: 'Accessories', description: 'Glasses, headwear, jewellery, and other accessories will be added here in a later increment.' },
] as const

type CharacterPartId = (typeof characterParts)[number]['id']

const blankCharacter = {
  name: '',
  skinColour: 'original' as CharacterSkinColour,
  hairColour: 'original' as CharacterHairColour,
  shirtColour: 'original' as CharacterShirtColour,
}

function characterWrite(
  name: string,
  skinColour: CharacterSkinColour,
  hairColour: CharacterHairColour,
  shirtColour: CharacterShirtColour,
): CharacterWrite {
  return {
    name: name.trim(),
    template_key: 'base-character-prototype',
    template_version: 1,
    configuration_version: 1,
    settings: { skin_colour: skinColour, hair_colour: hairColour, shirt_colour: shirtColour },
  }
}

function useSvgImageSource(imageRef: RefObject<HTMLImageElement | null>, svg?: string) {
  useEffect(() => {
    const image = imageRef.current
    if (!image || !svg) return
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    image.src = url
    return () => {
      image.removeAttribute('src')
      URL.revokeObjectURL(url)
    }
  }, [imageRef, svg])
}

function CharacterArtwork({
  selectedSkinId,
  selectedHairId,
  selectedShirtId,
  name,
  className,
}: {
  selectedSkinId: CharacterSkinColour
  selectedHairId: CharacterHairColour
  selectedShirtId: CharacterShirtColour
  name: string
  className?: string
}) {
  const imageRef = useRef<HTMLImageElement>(null)
  const selectedSkin = skinColourOptions.find((option) => option.id === selectedSkinId) ?? skinColourOptions[0]
  const selectedHair = hairColourOptions.find((option) => option.id === selectedHairId) ?? hairColourOptions[0]
  const selectedShirt = shirtColourOptions.find((option) => option.id === selectedShirtId) ?? shirtColourOptions[0]
  const result = useMemo(() => {
    try {
      return {
        value: applyCharacterColours(characterTemplate, {
          skinColour: selectedSkin.value,
          hairColour: selectedHair.value,
          shirtColour: selectedShirt.value,
        }),
      }
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('The character preview could not be prepared.') }
    }
  }, [selectedHair.value, selectedShirt.value, selectedSkin.value])
  useSvgImageSource(imageRef, result.value?.svg)

  if (result.error) return <StatusMessage status="alert">The character preview could not be displayed.</StatusMessage>
  return <img className={className} ref={imageRef} alt={`${name || 'New character'} preview`} />
}

function CharacterPreview({
  selectedSkinId,
  selectedHairId,
  selectedShirtId,
  name,
}: {
  selectedSkinId: CharacterSkinColour
  selectedHairId: CharacterHairColour
  selectedShirtId: CharacterShirtColour
  name: string
}) {
  const selectedSkin = skinColourOptions.find((option) => option.id === selectedSkinId) ?? skinColourOptions[0]
  const selectedHair = hairColourOptions.find((option) => option.id === selectedHairId) ?? hairColourOptions[0]
  const selectedShirt = shirtColourOptions.find((option) => option.id === selectedShirtId) ?? shirtColourOptions[0]
  return (
    <section className="character-editor__preview" aria-labelledby="character-preview-heading">
      <h2 className="visually-hidden" id="character-preview-heading">Character preview</h2>
      <figure>
        <CharacterArtwork selectedSkinId={selectedSkinId} selectedHairId={selectedHairId} selectedShirtId={selectedShirtId} name={name} />
        <figcaption aria-live="polite">
          Skin colour: {selectedSkin.label}. Hair colour: {selectedHair.label}. Shirt colour: {selectedShirt.label}.
        </figcaption>
      </figure>
    </section>
  )
}

function HairColourPanel({
  selectedId,
  onChange,
}: {
  selectedId: CharacterHairColour
  onChange: (id: CharacterHairColour) => void
}) {
  return (
    <fieldset aria-describedby="hair-colour-help">
      <legend>Hair colour</legend>
      <p id="hair-colour-help">Choose a preset to update every labelled hair region in the character.</p>
      <div className="character-editor__choices">
        {hairColourOptions.map((option) => (
          <label className="character-editor__choice" key={option.id}>
            <input
              type="radio"
              name="character-hair-colour"
              value={option.id}
              checked={selectedId === option.id}
              onChange={() => onChange(option.id)}
            />
            <span
              className="character-editor__swatch"
              style={{ '--character-swatch': option.value } as CSSProperties}
              aria-hidden="true"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ShirtColourPanel({
  selectedId,
  onChange,
}: {
  selectedId: CharacterShirtColour
  onChange: (id: CharacterShirtColour) => void
}) {
  return (
    <fieldset aria-describedby="shirt-colour-help">
      <legend>Shirt colour</legend>
      <p id="shirt-colour-help">Choose a preset to update every labelled shirt region in the character.</p>
      <div className="character-editor__choices">
        {shirtColourOptions.map((option) => (
          <label className="character-editor__choice" key={option.id}>
            <input
              type="radio"
              name="character-shirt-colour"
              value={option.id}
              checked={selectedId === option.id}
              onChange={() => onChange(option.id)}
            />
            <span
              className="character-editor__swatch"
              style={{ '--character-swatch': option.value } as CSSProperties}
              aria-hidden="true"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function SkinColourPanel({
  selectedId,
  onChange,
}: {
  selectedId: CharacterSkinColour
  onChange: (id: CharacterSkinColour) => void
}) {
  return (
    <fieldset aria-describedby="skin-colour-help">
      <legend>Skin colour</legend>
      <p id="skin-colour-help">Choose a preset to update every labelled skin region in the character.</p>
      <div className="character-editor__choices">
        {skinColourOptions.map((option) => (
          <label className="character-editor__choice" key={option.id}>
            <input
              type="radio"
              name="character-skin-colour"
              value={option.id}
              checked={selectedId === option.id}
              onChange={() => onChange(option.id)}
            />
            <span
              className="character-editor__swatch"
              style={{ '--character-swatch': option.value } as CSSProperties}
              aria-hidden="true"
            />
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
      const focusId = next ? `character-edit-${next.id}` : 'new-character-link'
      window.setTimeout(() => document.getElementById(focusId)?.focus(), 0)
    } catch (caught) {
      setDeleteError(caught as Error)
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div className="account-section character-library">
      <SectionHeading
        title="My characters"
        description="Create, save, and reuse characters across personalized communication symbols."
        action={<ButtonLink id="new-character-link" to="/account/characters/new" variant="primary">New character</ButtonLink>}
      />
      {loading && <StatusMessage status="status">Loading your characters…</StatusMessage>}
      {!loading && error && (
        <StatusMessage status="alert">
          <h2>Characters could not be loaded</h2>
          <p>Try again. Your saved characters have not been changed.</p>
          <Button onClick={() => void load()}>Try again</Button>
        </StatusMessage>
      )}
      {!loading && !error && characters.length === 0 && (
        <EmptyState
          className="character-library__empty"
          eyebrow="Character library"
          badge={<Badge>Ready to create</Badge>}
          heading="No characters yet"
          description="Create your first character and it will appear here."
        />
      )}
      {!loading && !error && characters.length > 0 && (
        <ResponsiveGrid className="character-library__grid">
          {characters.map((character) => (
            <Surface className="character-card" key={character.id}>
              <div className="character-card__preview">
                <CharacterArtwork
                  selectedSkinId={character.settings.skin_colour}
                  selectedHairId={character.settings.hair_colour}
                  selectedShirtId={character.settings.shirt_colour}
                  name={character.name}
                />
              </div>
              <div className="character-card__content">
                <h3>{character.name}</h3>
                <p><time dateTime={character.updated_at}>Updated {formatUpdatedAt(character.updated_at)}</time></p>
                <FormActions>
                  <ButtonLink id={`character-edit-${character.id}`} to={`/account/characters/${character.id}/edit`}>
                    <Pencil aria-hidden="true" focusable="false" size={18} /> Edit
                  </ButtonLink>
                  <Button onClick={() => { setDeleteError(undefined); setDeleting(character) }}>
                    <Trash2 aria-hidden="true" focusable="false" size={18} /> Delete
                  </Button>
                </FormActions>
              </div>
            </Surface>
          ))}
        </ResponsiveGrid>
      )}

      <dialog
        className="character-delete-dialog"
        ref={dialogRef}
        aria-labelledby="character-delete-title"
        onCancel={(event) => { event.preventDefault(); if (!deletePending) setDeleting(undefined) }}
        onClose={() => { if (!deletePending) setDeleting(undefined) }}
      >
        <h2 id="character-delete-title">Delete {deleting?.name || 'character'}?</h2>
        <p>This permanently removes the character from your library.</p>
        {deleteError && <StatusMessage status="alert">The character could not be deleted. Try again.</StatusMessage>}
        <FormActions>
          <Button disabled={deletePending} onClick={() => setDeleting(undefined)}>Cancel</Button>
          <Button variant="primary" disabled={deletePending} onClick={() => void confirmDelete()}>
            {deletePending ? 'Deleting…' : 'Delete character'}
          </Button>
        </FormActions>
      </dialog>
    </div>
  )
}

export function CharacterEditorPage() {
  const auth = useAppAuth()
  const navigate = useNavigate()
  const { characterId } = useParams()
  const [activePart, setActivePart] = useState<CharacterPartId>('skin')
  const [name, setName] = useState(blankCharacter.name)
  const [nameDraft, setNameDraft] = useState(blankCharacter.name)
  const [editingName, setEditingName] = useState(!characterId)
  const [selectedSkinId, setSelectedSkinId] = useState<CharacterSkinColour>(blankCharacter.skinColour)
  const [selectedHairId, setSelectedHairId] = useState<CharacterHairColour>(blankCharacter.hairColour)
  const [selectedShirtId, setSelectedShirtId] = useState<CharacterShirtColour>(blankCharacter.shirtColour)
  const [savedCharacter, setSavedCharacter] = useState<SavedCharacter>()
  const [loading, setLoading] = useState(Boolean(characterId))
  const [loadError, setLoadError] = useState<Error>()
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'error' | 'conflict'>()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const nameInputRef = useRef<HTMLInputElement>(null)
  const restoreNameFocus = useRef(false)
  const restoringHistory = useRef(false)

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
      setSelectedSkinId(character.settings.skin_colour)
      setSelectedHairId(character.settings.hair_colour)
      setSelectedShirtId(character.settings.shirt_colour)
    } catch (caught) {
      setLoadError(caught as Error)
    } finally {
      setLoading(false)
    }
  }, [auth.getToken, characterId])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the route begins an authenticated request lifecycle. */
    void load()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load])

  const baseline = savedCharacter
    ? {
        name: savedCharacter.name,
        skinColour: savedCharacter.settings.skin_colour,
        hairColour: savedCharacter.settings.hair_colour,
        shirtColour: savedCharacter.settings.shirt_colour,
      }
    : blankCharacter
  const dirty = name !== baseline.name
    || selectedSkinId !== baseline.skinColour
    || selectedHairId !== baseline.hairColour
    || selectedShirtId !== baseline.shirtColour
  const valid = name.trim().length > 0 && name.trim().length <= 80
  const nameDraftValid = nameDraft.trim().length > 0 && nameDraft.trim().length <= 80
  const hasUnsavedChanges = (dirty && valid) || (editingName && nameDraft !== name)

  useEffect(() => {
    if (editingName && !loading) nameInputRef.current?.focus()
  }, [editingName, loading])

  useEffect(() => {
    if (editingName || !restoreNameFocus.current) return
    restoreNameFocus.current = false
    document.getElementById('character-name-edit')?.focus()
  }, [editingName])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warnOnHistory = () => {
      if (restoringHistory.current) {
        restoringHistory.current = false
        return
      }
      if (!window.confirm('Leave the character editor? Your unsaved changes will be lost.')) {
        restoringHistory.current = true
        window.history.forward()
      }
    }
    window.addEventListener('popstate', warnOnHistory)
    return () => window.removeEventListener('popstate', warnOnHistory)
  }, [hasUnsavedChanges])

  function exitEditor() {
    if (hasUnsavedChanges && !window.confirm('Leave the character editor? Your unsaved changes will be lost.')) return
    navigate('/account/characters')
  }

  function beginNameEditing() {
    setNameDraft(name)
    setSaveStatus(undefined)
    setEditingName(true)
  }

  function finishNameEditing() {
    if (!nameDraftValid) return
    const nextName = nameDraft.trim()
    setName(nextName)
    setNameDraft(nextName)
    setSaveStatus(undefined)
    restoreNameFocus.current = true
    setEditingName(false)
  }

  function cancelNameEditing() {
    setNameDraft(name)
    restoreNameFocus.current = true
    setEditingName(false)
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      finishNameEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelNameEditing()
    }
  }

  function selectTab(index: number) {
    const wrappedIndex = (index + characterParts.length) % characterParts.length
    setActivePart(characterParts[wrappedIndex]!.id)
    tabRefs.current[wrappedIndex]?.focus()
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const destination = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: characterParts.length - 1,
    }[event.key]
    if (destination === undefined) return
    event.preventDefault()
    selectTab(destination)
  }

  async function save() {
    if (!valid || !dirty || saving) return
    setSaving(true)
    setSaveStatus(undefined)
    try {
      const write = characterWrite(name, selectedSkinId, selectedHairId, selectedShirtId)
      const character = savedCharacter
        ? await updateCharacter(auth.getToken, savedCharacter.id, write, savedCharacter.revision)
        : await createCharacter(auth.getToken, write)
      setSavedCharacter(character)
      setName(character.name)
      setNameDraft(character.name)
      setEditingName(false)
      setSelectedSkinId(character.settings.skin_colour)
      setSelectedHairId(character.settings.hair_colour)
      setSelectedShirtId(character.settings.shirt_colour)
      setSaveStatus('saved')
      if (!characterId) navigate(`/account/characters/${character.id}/edit`, { replace: true })
    } catch (caught) {
      setSaveStatus(caught instanceof ApiError && caught.code === 'character_conflict' ? 'conflict' : 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveHelp = editingName
    ? 'Finish editing the character name before saving.'
    : !valid
    ? 'Enter a character name between 1 and 80 characters.'
    : saving
      ? 'Saving your character.'
      : !dirty
        ? 'No unsaved changes.'
        : 'Save your changes to your private character library.'

  return (
    <div className="character-editor">
      <header className="character-editor__topbar">
        <div className="character-editor__identity"><strong>Open Symbols</strong><Badge>Prototype</Badge></div>
        <div className="character-editor__title">
          <p className="eyebrow">Character builder</p>
          <h1 className="visually-hidden" id="character-editor-title">{characterId ? 'Edit character' : 'New character'}</h1>
          {editingName ? (
            <div className="character-editor__name-editor">
              <label className="visually-hidden" htmlFor="character-name">Character name</label>
              <input
                ref={nameInputRef}
                className="field__control character-editor__name-input"
                id="character-name"
                required
                maxLength={80}
                value={nameDraft}
                aria-invalid={!nameDraftValid}
                aria-describedby={!nameDraftValid ? 'character-name-error' : undefined}
                disabled={loading}
                onChange={(event) => { setNameDraft(event.target.value); setSaveStatus(undefined) }}
                onKeyDown={handleNameKeyDown}
              />
              <div className="character-editor__name-actions">
                <Button variant="primary" disabled={!nameDraftValid || loading} onClick={finishNameEditing}>Done</Button>
                <Button disabled={loading} onClick={cancelNameEditing}>Cancel</Button>
              </div>
              {!nameDraftValid && (
                <span className="field__error" id="character-name-error">Enter a character name between 1 and 80 characters.</span>
              )}
            </div>
          ) : (
            <div className="character-editor__name-display">
              <p>{name || 'Name your character'}</p>
              <Button id="character-name-edit" disabled={loading} onClick={beginNameEditing}>
                <Pencil aria-hidden="true" focusable="false" size={18} /> Edit name
              </Button>
            </div>
          )}
        </div>
        <div className="character-editor__actions">
          <Button onClick={exitEditor}>
            <ArrowLeft aria-hidden="true" focusable="false" size={20} /> Exit editor
          </Button>
          <Button variant="primary" disabled={editingName || !valid || !dirty || saving || loading} aria-describedby="character-save-help" onClick={() => void save()}>
            <Save aria-hidden="true" focusable="false" size={20} />
            {saving ? 'Saving…' : 'Save character'}
          </Button>
          <span id="character-save-help">{saveHelp}</span>
        </div>
      </header>

      {loading ? <StatusMessage className="character-editor__loading" status="status">Loading character…</StatusMessage> : loadError ? (
        <StatusMessage className="character-editor__loading" status="alert">
          <h2>Character could not be loaded</h2>
          <p>{loadError instanceof ApiError && loadError.status === 404 ? 'This character was not found.' : 'Try loading the character again.'}</p>
          <Button onClick={() => void load()}>Try again</Button>
        </StatusMessage>
      ) : (
        <section className="character-editor__workspace" aria-labelledby="character-editor-title">
          <nav className="character-editor__parts" aria-label="Character parts">
            <div role="tablist" aria-label="Character parts">
              {characterParts.map((part, index) => (
                <button
                  ref={(element) => { tabRefs.current[index] = element }}
                  key={part.id}
                  id={`character-part-${part.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activePart === part.id}
                  aria-controls={`character-panel-${part.id}`}
                  tabIndex={activePart === part.id ? 0 : -1}
                  onClick={() => setActivePart(part.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                >
                  {part.label}
                </button>
              ))}
            </div>
          </nav>

          <CharacterPreview selectedSkinId={selectedSkinId} selectedHairId={selectedHairId} selectedShirtId={selectedShirtId} name={name} />

          <Surface className="character-editor__options" tone="accent" aria-label="Character options">
            {saveStatus === 'saved' && <StatusMessage status="status">Character saved.</StatusMessage>}
            {saveStatus === 'error' && <StatusMessage status="alert">The character could not be saved. Your changes are still here.</StatusMessage>}
            {saveStatus === 'conflict' && (
              <StatusMessage status="alert">
                <h2>This character changed elsewhere</h2>
                <p>Your changes were not overwritten. Reload the saved version before editing again.</p>
                <Button onClick={() => { setSaveStatus(undefined); void load() }}>Reload saved character</Button>
              </StatusMessage>
            )}
            {characterParts.map((part) => (
              <div
                key={part.id}
                id={`character-panel-${part.id}`}
                role="tabpanel"
                aria-labelledby={`character-part-${part.id}`}
                hidden={activePart !== part.id}
                tabIndex={part.id === 'skin' || part.id === 'hair' || part.id === 'clothing' ? undefined : 0}
              >
                {part.id === 'skin' ? (
                  <SkinColourPanel selectedId={selectedSkinId} onChange={(id) => { setSelectedSkinId(id); setSaveStatus(undefined) }} />
                ) : part.id === 'hair' ? (
                  <HairColourPanel selectedId={selectedHairId} onChange={(id) => { setSelectedHairId(id); setSaveStatus(undefined) }} />
                ) : part.id === 'clothing' ? (
                  <ShirtColourPanel selectedId={selectedShirtId} onChange={(id) => { setSelectedShirtId(id); setSaveStatus(undefined) }} />
                ) : (
                  <div className="character-editor__placeholder">
                    <Badge>Coming soon</Badge><h2>{part.label}</h2><p>{part.description}</p>
                  </div>
                )}
              </div>
            ))}
          </Surface>
        </section>
      )}
    </div>
  )
}
