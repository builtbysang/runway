import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const STEERING_FILES = [
  'product.md',
  'structure.md',
  'tech.md',
  'ux-rules.md',
  'visual-rules.md',
  'design-system.md',
  'components.md',
] as const

export type SteeringFileName = typeof STEERING_FILES[number]

export interface SteeringDocs {
  product: string
  structure: string
  tech: string
  uxRules: string
  visualRules: string
  designSystem: string
  components: string
}

function trimSection(content: string, maxChars: number) {
  const normalized = content.trim()
  if (normalized.length <= maxChars) {
    return normalized
  }
  return `${normalized.slice(0, maxChars)}…`
}

export function getSteeringDir(localRepoPath: string) {
  return join(resolve(localRepoPath), '.runway', 'steering')
}

export async function writeSteeringDocs(localRepoPath: string, docs: SteeringDocs) {
  const dir = getSteeringDir(localRepoPath)
  await mkdir(dir, { recursive: true })

  await Promise.all([
    writeFile(join(dir, 'product.md'), `${docs.product.trim()}\n`, 'utf-8'),
    writeFile(join(dir, 'structure.md'), `${docs.structure.trim()}\n`, 'utf-8'),
    writeFile(join(dir, 'tech.md'), `${docs.tech.trim()}\n`, 'utf-8'),
    writeFile(join(dir, 'ux-rules.md'), `${docs.uxRules.trim()}\n`, 'utf-8'),
    writeFile(join(dir, 'visual-rules.md'), `${docs.visualRules.trim()}\n`, 'utf-8'),
    writeFile(join(dir, 'design-system.md'), `${docs.designSystem.trim()}\n`, 'utf-8'),
    writeFile(join(dir, 'components.md'), `${docs.components.trim()}\n`, 'utf-8'),
  ])

  return {
    dir,
    files: {
      product: join(dir, 'product.md'),
      structure: join(dir, 'structure.md'),
      tech: join(dir, 'tech.md'),
      uxRules: join(dir, 'ux-rules.md'),
      visualRules: join(dir, 'visual-rules.md'),
      designSystem: join(dir, 'design-system.md'),
      components: join(dir, 'components.md'),
    },
  }
}

export async function readSteeringContext(localRepoPath?: string): Promise<string | null> {
  if (!localRepoPath) {
    return null
  }

  const dir = getSteeringDir(localRepoPath)

  try {
    const [product, structure, tech, uxRules, visualRules, designSystem, components] = await Promise.all(
      STEERING_FILES.map((file) => readFile(join(dir, file), 'utf-8').catch(() => '')),
    )

    const sections = [
      product ? `# Product Steering\n${trimSection(product, 1600)}` : '',
      structure ? `# Structure Steering\n${trimSection(structure, 1400)}` : '',
      tech ? `# Tech Steering\n${trimSection(tech, 1400)}` : '',
      uxRules ? `# UX Rules\n${trimSection(uxRules, 1400)}` : '',
      visualRules ? `# Visual Rules\n${trimSection(visualRules, 1400)}` : '',
      designSystem ? `# Design System Rules\n${trimSection(designSystem, 1400)}` : '',
      components ? `# Component Rules\n${trimSection(components, 1600)}` : '',
    ].filter(Boolean)

    return sections.length > 0 ? sections.join('\n\n') : null
  } catch {
    return null
  }
}
