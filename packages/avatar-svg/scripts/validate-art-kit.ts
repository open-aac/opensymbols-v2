import { productionArtKit } from '../src/generated/production-art-kit.js'
import { validateArtKit } from '../src/validation.js'

const issues = validateArtKit(productionArtKit)
if (issues.length > 0) {
  for (const issue of issues) console.error(`${issue.code} at ${issue.path}: ${issue.message}`)
  process.exitCode = 1
} else if (productionArtKit.status === 'pending') {
  console.log('Art-kit structure is valid. Production artwork is pending illustrator approval.')
} else {
  console.log(`Art kit v${productionArtKit.version} is valid.`)
}
