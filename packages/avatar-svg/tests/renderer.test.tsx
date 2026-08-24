import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { productionArtKit } from '../src/generated/production-art-kit.js'
import { developmentArtKit, developmentDefaultIdentity, developmentNeutralAction } from '../src/development-art-kit.js'
import { AvatarSvg } from '../src/react.js'
import { resolveAvatar } from '../src/resolve.js'
import { serializeAvatarSvg } from '../src/serialize.js'
import { fixtureAction, fixtureArtKit, fixtureIdentity } from './fixtures.js'

describe('avatar resolution and rendering', () => {
  it('renders the development kit through the shared renderer contract', () => {
    expect(resolveAvatar(developmentArtKit, developmentDefaultIdentity, developmentNeutralAction).kind).toBe('ready')
    const markup = renderToStaticMarkup(
      <AvatarSvg artKit={developmentArtKit} identity={developmentDefaultIdentity} action={developmentNeutralAction} title="Development avatar" />,
    )
    expect(markup).toContain('data-avatar-state="ready"')
    expect(markup).toContain('body-average')
    expect(markup).toContain('hair-short-front')
  })

  it('sorts resolved parts by the documented layer order', () => {
    const result = resolveAvatar(fixtureArtKit, fixtureIdentity, fixtureAction)
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') expect(result.parts.map(({ part }) => part.id)).toEqual([
      'fixture-body', 'fixture-wave-arm', 'fixture-left-hand', 'fixture-right-hand', 'fixture-neutral-face', 'fixture-hair',
    ])
  })

  it('renders generated React SVG elements without injected markup', () => {
    const markup = renderToStaticMarkup(<AvatarSvg artKit={fixtureArtKit} identity={fixtureIdentity} action={fixtureAction} title="Sam waves" />)
    expect(markup).toContain('data-avatar-state="ready"')
    expect(markup).toContain('<path')
    expect(markup).toContain('Sam waves')
    expect(markup).not.toContain('dangerouslySetInnerHTML')
  })

  it('mirrors only the rendered assembly', () => {
    const original = structuredClone(fixtureAction)
    const result = serializeAvatarSvg(fixtureArtKit, fixtureIdentity, { ...fixtureAction, mirrored: true })
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') expect(result.svg).toContain('translate(300 0) scale(-1 1)')
    expect(fixtureAction).toEqual(original)
  })

  it('serializes a standalone SVG with inline colours and no editor markers', () => {
    const result = serializeAvatarSvg(fixtureArtKit, fixtureIdentity, fixtureAction)
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') {
      expect(result.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
      expect(result.svg).toContain('width="300" height="300"')
      expect(result.svg).toContain('#c88b6c')
      expect(result.svg).not.toContain('currentColor')
      expect(result.svg).not.toMatch(/diagnostic|connector-marker|editor-control/)
    }
  })

  it('serializes selections deterministically regardless of object insertion order', () => {
    const reorderedIdentity = {
      ...fixtureIdentity,
      selections: { frontHair: 'fixture-hair', body: 'fixture-body' },
    }
    expect(serializeAvatarSvg(fixtureArtKit, reorderedIdentity, fixtureAction)).toEqual(
      serializeAvatarSvg(fixtureArtKit, fixtureIdentity, fixtureAction),
    )
  })

  it('shows an explicit unavailable state while production artwork is pending', () => {
    const result = resolveAvatar(productionArtKit, fixtureIdentity, fixtureAction)
    expect(result).toMatchObject({ kind: 'unavailable', code: 'art_kit_pending' })
    const markup = renderToStaticMarkup(<AvatarSvg artKit={productionArtKit} identity={fixtureIdentity} action={fixtureAction} />)
    expect(markup).toContain('data-avatar-state="unavailable"')
    expect(markup).toContain('Avatar art unavailable')
  })
})
