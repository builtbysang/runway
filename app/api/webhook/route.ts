/**
 * POST /api/webhook
 * Receives Linear webhooks — triggers Dev Agent when issue → "In Progress"
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { runDevAgent } from '@/agents/dev-agent'
import type { LinearIssue } from '@/agents/dev-agent'

const IN_PROGRESS = ['in progress', 'in-progress', 'doing', 'started']

function verifySignature(body: string, sig: string): boolean {
  const secret = process.env.LINEAR_WEBHOOK_SECRET
  if (!secret) return true
  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('linear-signature') || ''

  if (!verifySignature(body, sig)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = JSON.parse(body)

  if (payload.type !== 'Issue' || payload.action !== 'update') {
    return NextResponse.json({ ok: true, skipped: 'not an issue update' })
  }

  const data = payload.data as Record<string, unknown>
  const prev = (payload.updatedFrom as Record<string, unknown>) || {}

  const newState = ((data?.state as Record<string, string>)?.name || '').toLowerCase()
  const oldState = ((prev?.state as Record<string, string>)?.name || '').toLowerCase()

  if (!IN_PROGRESS.includes(newState) || IN_PROGRESS.includes(oldState)) {
    return NextResponse.json({ ok: true, skipped: 'not in-progress transition' })
  }

  const issue: LinearIssue = {
    id: data.id as string,
    identifier: data.identifier as string,
    title: data.title as string,
    description: (data.description as string) || null,
    teamId: (data.team as Record<string, string>)?.id || '',
  }

  // Fire async — don't block webhook response
  runDevAgent(issue).catch((err) =>
    console.error(`[webhook] Dev agent failed for ${issue.identifier}:`, err)
  )

  return NextResponse.json({ ok: true, started: issue.identifier })
}
