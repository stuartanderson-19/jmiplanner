import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { syncGranolaMeetings, ExtractedMeeting } from '@/lib/granola'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handleAutoSync('last_30_days')
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))

  // If meetings are pre-provided, use them directly (fast path)
  if (body.meetings && Array.isArray(body.meetings) && body.meetings.length > 0) {
    const db = supabaseAdmin()
    const result = await syncGranolaMeetings(body.timeRange || 'last_30_days', body.meetings)
    await db.from('sync_logs').insert({
      success: result.success,
      new_meetings: result.newMeetings ?? 0,
      new_actions: result.newActions ?? 0,
      logs: result.logs,
    })
    return NextResponse.json(result)
  }

  // Auto-sync: use Claude to fetch from Granola MCP then extract meetings
  return handleAutoSync(body.timeRange || 'last_30_days')
}

async function handleAutoSync(timeRange: string) {
  const db = supabaseAdmin()

  try {
    // Use Claude with MCP client beta to talk to Granola
    const resp = await (client.messages.create as any)({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      betas: ['mcp-client-2025-04-04'],
      system: `You have access to the Granola meeting tool. Your job is to:
1. Call list_meetings with time_range="${timeRange}"
2. Call get_meetings with all the meeting IDs (in batches of 10)
3. Extract all action items from each meeting summary
4. Return ONLY a valid JSON array, no markdown, no explanation.

JSON format:
[{
  "granola_id": "uuid string",
  "title": "meeting title",
  "meeting_date": "ISO8601 datetime",
  "participants": ["name1", "name2"],
  "summary": "full meeting summary text",
  "actions": [
    {"text": "action description", "owner": "person name", "priority": "high|medium|low"}
  ]
}]

Return [] if no meetings found. Extract ALL next steps, follow-ups, and commitments as actions.`,
      messages: [{ role: 'user', content: `Fetch all meetings for time_range="${timeRange}", get their full details, extract actions, return the JSON array.` }],
      mcp_servers: [{
        type: 'url',
        url: process.env.GRANOLA_MCP_URL || 'https://mcp.granola.ai/mcp',
        name: 'granola',
      }],
    })

    // Parse the response
    const textBlock = resp.content?.find((b: any) => b.type === 'text')
    const rawText = textBlock?.text?.trim() || ''

    let meetings: ExtractedMeeting[] = []
    try {
      const clean = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
      const start = clean.indexOf('[')
      const end = clean.lastIndexOf(']')
      if (start !== -1 && end !== -1) {
        meetings = JSON.parse(clean.slice(start, end + 1))
      }
    } catch {
      // If Claude couldn't parse, return the raw error for debugging
      const result = { success: false, logs: [`Parse error. Raw response: ${rawText.slice(0, 300)}`], error: 'parse_error' }
      await db.from('sync_logs').insert({ success: false, new_meetings: 0, new_actions: 0, logs: result.logs })
      return NextResponse.json(result)
    }

    const result = await syncGranolaMeetings(timeRange as any, meetings)
    await db.from('sync_logs').insert({
      success: result.success,
      new_meetings: result.newMeetings ?? 0,
      new_actions: result.newActions ?? 0,
      logs: result.logs,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    const msg = err.message || 'Unknown error'
    await db.from('sync_logs').insert({ success: false, new_meetings: 0, new_actions: 0, logs: [msg] })
    return NextResponse.json({ success: false, error: msg, logs: [msg] })
  }
}
