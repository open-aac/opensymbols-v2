import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileSvgSource } from '../src/compiler.js'
import type { AvatarArtKitManifest, SvgPartDefinition } from '../src/contracts.js'
import { assertValidArtKit } from '../src/validation.js'

type AuthoringPart = Omit<SvgPartDefinition, 'nodes'> & { source: string }
type AuthoringManifest = Omit<AvatarArtKitManifest, 'parts'> & { parts: readonly AuthoringPart[] }

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(packageRoot, 'art-kit', 'manifest.json')
const outputPath = path.join(packageRoot, 'src', 'generated', 'production-art-kit.ts')
const authoringManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as AuthoringManifest

const parts = await Promise.all(authoringManifest.parts.map(async ({ source, ...part }) => {
  const sourcePath = path.resolve(path.dirname(manifestPath), source)
  if (!sourcePath.startsWith(`${path.dirname(manifestPath)}${path.sep}`)) throw new Error(`Artwork source escapes the art-kit directory: ${source}`)
  const svg = await readFile(sourcePath, 'utf8')
  return { ...part, nodes: compileSvgSource(svg, source) }
}))

const manifest: AvatarArtKitManifest = { ...authoringManifest, parts }
assertValidArtKit(manifest)
const moduleText = `import type { AvatarArtKitManifest } from '../contracts.js'\n\nexport const productionArtKit: AvatarArtKitManifest = ${JSON.stringify(manifest, null, 2)}\n`
await writeFile(outputPath, moduleText, 'utf8')
console.log(`Compiled ${parts.length} approved SVG parts into ${path.relative(packageRoot, outputPath)}.`)
