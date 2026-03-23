import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface ProjectConfig {
  linearTeamId: string
  githubRepo: string
  localRepoPath?: string
  description?: string
  techStack?: string
  linearReviewStateName?: string
  notionContextPageId?: string
  notionSyncPageId?: string
}

export type ProjectsConfig = Record<string, ProjectConfig>

export function getConfigPath() {
  return resolve(process.cwd(), 'projects.json')
}

export function readConfig(): ProjectsConfig {
  const raw = readFileSync(getConfigPath(), 'utf-8')
  return JSON.parse(raw) as ProjectsConfig
}

export function writeConfig(config: ProjectsConfig) {
  writeFileSync(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`)
}

export function getProjectConfig(projectKey: string): ProjectConfig {
  const config = readConfig()[projectKey]
  if (!config) {
    throw new Error(`Unknown projectKey: ${projectKey}`)
  }
  return config
}
