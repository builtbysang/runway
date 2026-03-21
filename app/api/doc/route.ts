/**
 * POST /api/doc
 * Body: {
 *   context: string           — raw project context, notes, or idea
 *   docType: 'brief' | 'prd'  — document type to generate
 *   notionParentId: string    — Notion page or database ID to create the doc under
 *   notionParentType?: 'page' | 'database'  — defaults to 'page'
 * }
 * Runs Doc Agent: context → Claude draft → Notion page
 */
import { NextRequest, NextResponse } from 'next/server'
import { runDocAgent } from '@/agents/doc-agent'

export async function POST(req: NextRequest) {
  const { context, docType, notionParentId, notionParentType } = await req.json()

  if (!context || !docType || !notionParentId) {
    return NextResponse.json(
      { error: 'context, docType, and notionParentId are required' },
      { status: 400 }
    )
  }

  if (docType !== 'brief' && docType !== 'prd') {
    return NextResponse.json(
      { error: 'docType must be "brief" or "prd"' },
      { status: 400 }
    )
  }

  try {
    const result = await runDocAgent({ context, docType, notionParentId, notionParentType })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
