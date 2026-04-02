import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { syncGranolaMeetings } from '@/lib/granola'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchMeetingsFromGranola(timeRange: string) {
  // Step 1: List meetings
  const listResp = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: `Use the list_meetings tool with time_range="${timeRange}" and return the raw results as JSON.` }],
    tools: [{
      name: 'list_meetings',
      description: 'List Granola meetings',
      input_schema: {
        type: 'object' as const,
        properties: { time_range: { type: 'string' } },
      }
    }],
  } as any)

  // Use Granola MCP via fetch directly
  const granolaUrl = process.env.GRANOLA_MCP_URL || 'https://mcp.granola.ai/mcp'
  
  // List meetings via MCP
  const listRes = await fetch(granolaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'list_meetings',
        arguments: { time_range: timeRange }
      }
    })
  })
  
  if (!listRes.ok) throw new Error(`Granola list_meetings failed: ${listRes.status}`)
  const listData = await listRes.json()
  
  return listData
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handleSync('last_30_days')
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const timeRange = body.timeRange || 'last_30_days'
  
  // Accept pre-fetched meetings from client
  if (body.meetings) {
    const db = supabaseAdmin()
    const result = await syncGranolaMeetings(timeRange, body.meetings)
    await db.from('sync_logs').insert({
      success: result.success,
      new_meetings: result.newMeetings ?? 0,
      new_actions: result.newActions ?? 0,
      logs: result.logs,
    })
    return NextResponse.json(result)
  }

  return handleSync(timeRange)
}

async function handleSync(timeRange: string) {
  const db = supabaseAdmin()

  // Use Claude with betas to call Granola MCP, then extract meetings
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: `You have access to Granola meeting tools. List all meetings for the given time range, get their details in batches of 10, and return a JSON array. Return ONLY valid JSON, no markdown.

Format:
[{
  "granola_id": "uuid",
  "title": "string",
  "meeting_date": "ISO8601",
  "participants": ["name"],
  "summary": "full summary",
  "actions": [{"text": "string", "owner": "string", "priority": "high|medium|low"}]
}]`,
    messages: [{ role: 'user', content: `List meetings for time_range="${timeRange}", fetch details for all of them, extract all action items, return the JSON array.` }],
    betas: ['mcp-client-2025-04-04'],
    mcp_servers: [{
      type: 'url',
      url: process.env.GRANOLA_MCP_URL || 'https://mcp.granola.ai/mcp',
      name: 'granola',
    }],
  } as any)

  const textBlock = resp.content.find((b: any) => b.type === 'text')
  const text = textBlock?.text?.trim() || ''
  
  let meetings = []
  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start !== -1 && end !== -1) {
      meetings = JSON.parse(clean.slice(start, end + 1))
    }
  } catch (e) {
    const result = { success: false, logs: [`Failed to parse meetings: ${text.slice(0, 200)}`], error: 'parse error' }
    await db.from('sync_logs').insert({ success: false, new_meetings: 0, new_actions: 0, logs: result.logs })
    return NextResponse.json(result)
  }

  const result = await syncGranolaMeetings(timeRange, meetings)
  await db.from('sync_logs').insert({
    success: result.success,
    new_meetings: result.newMeetings ?? 0,
    new_actions: result.newActions ?? 0,
    logs: result.logs,
  })

  return NextResponse.json(result)
}
