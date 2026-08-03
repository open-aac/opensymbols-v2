import { type CSSProperties, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import characterTemplate from '../assets/characters/base-character-prototype.svg?raw'
import { Badge, SectionHeading, StatusMessage, Surface } from '../components/ui'
import { applyCharacterSkinColour, skinColourOptions } from './character-template'

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

export function CharacterBuilderPage() {
  const [selectedId, setSelectedId] = useState<(typeof skinColourOptions)[number]['id']>('original')
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
    <div className="account-section character-builder">
      <SectionHeading
        title="Build your character"
        description="Start by choosing a skin colour for this prototype character. More ways to personalize it will come later."
        action={<Badge>Prototype</Badge>}
      />
      <div className="character-builder__layout">
        <Surface className="character-builder__preview" tone="muted">
          {result.error ? (
            <StatusMessage status="alert">The character preview could not be displayed.</StatusMessage>
          ) : (
            <figure>
              <img ref={imageRef} alt="Prototype character preview" />
              <figcaption>Skin colour: {selected.label}</figcaption>
            </figure>
          )}
        </Surface>
        <Surface className="character-builder__controls" tone="accent">
          <fieldset aria-describedby="skin-colour-help">
            <legend>Skin colour</legend>
            <p id="skin-colour-help">Choose a preset to update every labelled skin region in the character.</p>
            <div className="character-builder__choices">
              {skinColourOptions.map((option) => (
                <label className="character-builder__choice" key={option.id}>
                  <input
                    type="radio"
                    name="character-skin-colour"
                    value={option.id}
                    checked={selectedId === option.id}
                    onChange={() => setSelectedId(option.id)}
                  />
                  <span
                    className="character-builder__swatch"
                    style={{ '--character-swatch': option.value } as CSSProperties}
                    aria-hidden="true"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Surface>
      </div>
    </div>
  )
}
