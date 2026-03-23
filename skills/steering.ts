import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const STEERING_FILES = [
  'product.md',
  'structure.md',
  'tech.md',
  '02-ux-rules.md',
  '03-visual-rules.md',
  '04-design-system.md',
] as const

export type SteeringFileName = typeof STEERING_FILES[number]

export interface SteeringDocs {
  product: string
  structure: string
  tech: string
  uxRules: string
  visualRules: string
  designSystem: string
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
    writeFile(join(dir, '02-ux-rules.md'), `${docs.uxRules.trim()}\n`, 'utf-8'),
    writeFile(join(dir, '03-visual-rules.md'), `${docs.visualRules.trim()}\n`, 'utf-8'),
    writeFile(join(dir, '04-design-system.md'), `${docs.designSystem.trim()}\n`, 'utf-8'),
  ])

  return {
    dir,
    files: {
      product: join(dir, 'product.md'),
      structure: join(dir, 'structure.md'),
      tech: join(dir, 'tech.md'),
      uxRules: join(dir, '02-ux-rules.md'),
      visualRules: join(dir, '03-visual-rules.md'),
      designSystem: join(dir, '04-design-system.md'),
    },
  }
}

export async function readSteeringContext(localRepoPath?: string): Promise<string | null> {
  if (!localRepoPath) {
    return null
  }

  const dir = getSteeringDir(localRepoPath)

  try {
    const [product, structure, tech, uxRules, visualRules, designSystem] = await Promise.all(
      STEERING_FILES.map((file) => readFile(join(dir, file), 'utf-8').catch(() => '')),
    )

    const sections = [
      product ? `# Product Steering\n${trimSection(product, 1600)}` : '',
      structure ? `# Structure Steering\n${trimSection(structure, 1400)}` : '',
      tech ? `# Tech Steering\n${trimSection(tech, 1400)}` : '',
      uxRules ? `# UX Rules\n${trimSection(uxRules, 1400)}` : '',
      visualRules ? `# Visual Rules\n${trimSection(visualRules, 1400)}` : '',
      designSystem ? `# Design System Rules\n${trimSection(designSystem, 1400)}` : '',
    ].filter(Boolean)

    return sections.length > 0 ? sections.join('\n\n') : null
  } catch {
    return null
  }
}
