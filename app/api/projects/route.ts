/**
 * GET /api/projects — list configured projects
 * POST /api/projects — add a new project
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const CONFIG_PATH = join(process.cwd(), 'projects.json')

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
}

export async function GET() {
  return NextResponse.json(readConfig())
}

export async function POST(req: NextRequest) {
  const { key, linearTeamId, githubRepo, description, techStack } = await req.json()
  if (!key || !linearTeamId || !githubRepo) {
    return NextResponse.json(
      { error: 'key, linearTeamId, githubRepo are required' },
      { status: 400 }
    )
  }
  const config = readConfig()
  config[key] = { linearTeamId, githubRepo, description, techStack }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  return NextResponse.json({ ok: true, project: config[key] })
}
