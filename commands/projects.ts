import { readConfig, writeConfig } from '../lib/config'

export interface AddProjectOptions {
  key: string
  linearTeamId: string
  githubRepo: string
  localRepoPath?: string
  description?: string
  techStack?: string
  notionContextPageId?: string
  notionSyncPageId?: string
}

export function listProjectsCommand() {
  return readConfig()
}

export function addProjectCommand(options: AddProjectOptions) {
  const config = readConfig()
  config[options.key] = {
    linearTeamId: options.linearTeamId,
    githubRepo: options.githubRepo,
    localRepoPath: options.localRepoPath,
    description: options.description,
    techStack: options.techStack,
    notionContextPageId: options.notionContextPageId,
    notionSyncPageId: options.notionSyncPageId,
  }
  writeConfig(config)
  return { ok: true, project: config[options.key] }
}
