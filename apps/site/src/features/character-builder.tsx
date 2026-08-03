import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import characterTemplate from '../assets/characters/base-character-prototype.svg?raw'
import { Badge, Button, ButtonLink, EmptyState, SectionHeading, StatusMessage, Surface } from '../components/ui'
import { applyCharacterSkinColour, skinColourOptions } from './character-template'
import './character-builder.css'

const characterParts = [
  {
    id: 'skin',
    label: 'Skin',
    description: 'Choose the skin colour used by every artist-labelled skin region.',
  },
  {
    id: 'hair',
    label: 'Hair',
    description: 'Hair styles, textures, and colours will be added here in a later increment.',
  },
  {
    id: 'face',
    label: 'Face',
    description: 'Facial features and expressions will be added here in a later increment.',
  },
  {
    id: 'clothing',
    label: 'Clothing',
    description: 'Tops, bottoms, footwear, and clothing colours will be added here in a later increment.',
  },
  {
    id: 'mobility',
    label: 'Mobility & body',
    description: 'Mobility aids, limb differences, and body options will be added here in a later increment.',
  },
  {
    id: 'accessories',
    label: 'Accessories',
    description: 'Glasses, headwear, jewellery, and other accessories will be added here in a later increment.',
  },
] as const

type CharacterPartId = (typeof characterParts)[number]['id']

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

function CharacterPreview({ selectedId }: { selectedId: (typeof skinColourOptions)[number]['id'] }) {
  const imageRef = useRef<HTMLImageElement>(null)
  const selected = skinColourOptions.find((option) => option.id === selectedId) ?? skinColourOptions[0]
  const result = useMemo(() => {
    try {
      return { value: applyCharacterSkinColour(characterTemplate, selected.value) }
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('The character preview could not be prepared.') }
    }
  }, [selected.value])
  useSvgImageSource(imageRef, result.value?.svg)

  return (
    <section className="character-editor__preview" aria-labelledby="character-preview-heading">
      <h2 className="visually-hidden" id="character-preview-heading">Character preview</h2>
      {result.error ? (
        <StatusMessage status="alert">The character preview could not be displayed.</StatusMessage>
      ) : (
        <figure>
          <img ref={imageRef} alt="Prototype character preview" />
          <figcaption aria-live="polite">Skin colour: {selected.label}</figcaption>
        </figure>
      )}
    </section>
  )
}

function SkinColourPanel({
  selectedId,
  onChange,
}: {
  selectedId: (typeof skinColourOptions)[number]['id']
  onChange: (id: (typeof skinColourOptions)[number]['id']) => void
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

export function CharacterLibraryPage() {
  return (
    <div className="account-section character-library">
      <SectionHeading
        title="My characters"
        description="Create characters that can eventually be saved and reused across personalized communication symbols."
        action={<ButtonLink to="/account/characters/new" variant="primary">New character</ButtonLink>}
      />
      <EmptyState
        className="character-library__empty"
        eyebrow="Character library"
        badge={<Badge>Prototype</Badge>}
        heading="No characters yet"
        description="Saving characters is coming soon. You can open the prototype editor now and explore its first working appearance option."
      />
    </div>
  )
}

export function CharacterEditorPage() {
  const [activePart, setActivePart] = useState<CharacterPartId>('skin')
  const [selectedSkinId, setSelectedSkinId] = useState<(typeof skinColourOptions)[number]['id']>('original')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

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

  return (
    <div className="character-editor">
      <header className="character-editor__topbar">
        <div className="character-editor__identity">
          <strong>Open Symbols</strong>
          <Badge>Prototype</Badge>
        </div>
        <div className="character-editor__title">
          <p className="eyebrow">Character builder</p>
          <h1 id="character-editor-title">New character</h1>
        </div>
        <div className="character-editor__actions">
          <ButtonLink to="/account/characters">
            <ArrowLeft aria-hidden="true" focusable="false" size={20} />
            Exit editor
          </ButtonLink>
          <Button variant="primary" disabled aria-describedby="character-save-help">
            <Save aria-hidden="true" focusable="false" size={20} />
            Save character
          </Button>
          <span id="character-save-help">Saving is coming soon.</span>
        </div>
      </header>

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

        <CharacterPreview selectedId={selectedSkinId} />

        <Surface className="character-editor__options" tone="accent" aria-label="Character options">
          {characterParts.map((part) => (
            <div
              key={part.id}
              id={`character-panel-${part.id}`}
              role="tabpanel"
              aria-labelledby={`character-part-${part.id}`}
              hidden={activePart !== part.id}
              tabIndex={part.id === 'skin' ? undefined : 0}
            >
              {part.id === 'skin' ? (
                <SkinColourPanel selectedId={selectedSkinId} onChange={setSelectedSkinId} />
              ) : (
                <div className="character-editor__placeholder">
                  <Badge>Coming soon</Badge>
                  <h2>{part.label}</h2>
                  <p>{part.description}</p>
                </div>
              )}
            </div>
          ))}
        </Surface>
      </section>
    </div>
  )
}
