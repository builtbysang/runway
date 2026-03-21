/**
 * POST /api/plan
 * Body: { projectKey: string, prd: string }
 * Runs PM Agent: PRD → Linear roadmap
 */
import { NextRequest, NextResponse } from 'next/server'
import { runPMAgent } from '@/agents/pm-agent'

export async function POST(req: NextRequest) {
  const { projectKey, prd } = await req.json()

  if (!projectKey || !prd) {
    return NextResponse.json({ error: 'projectKey and prd are required' }, { status: 400 })
  }

  try {
    const result = await runPMAgent({ projectKey, prd })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
