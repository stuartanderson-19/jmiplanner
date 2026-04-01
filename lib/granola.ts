import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ExtractedAction {
  text: string
  owner: string
  priority: 'high' | 'medium' | 'low'
}

export interface ExtractedMeeting {
  granola_id: string
  title: string
  meeting_date: string
  participants: string[]
  summary: string
  actions: ExtractedAction[]
}

export async function syncGranolaMeetings(timeRange: 'this_week' | 'last_week' | 'last_30_days' = 'last_30_days') {
  const db = supabaseAdmin()
  const logs: string[] = []

  try {
    logs.push(`Starting Granola sync for range: ${timeRange}`)

    // Step 1: List meetings via Granola MCP
    const listResp = await (client.messages.create as any)({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `You are a data extraction assistant. Use the Granola MCP to list meetings for the given time range, then fetch their full details in batches of 10. 
Return ONLY a JSON array (no markdown, no preamble) with this shape:
[{
  "granola_id": "uuid",
  "title": "meeting title",
  "meeting_date": "ISO8601 date string",
  "participants": ["name1", "name2"],
  "summary": "full summary text",
  "actions": [
    { "text": "action description", "owner": "person name or Both", "priority": "high|medium|low" }
  ]
}]
Extract ALL action items, next steps, follow-ups, and commitments. Be thorough. If a meeting has no clear actions, return an empty array for actions.`,
      messages: [{ role: 'user', content: `List all meetings from time_range="${timeRange}", fetch their details in batches, extract all action items, and return the JSON array.` }],
      mcp_servers: [{ type: 'url', url: process.env.GRANOLA_MCP_URL || 'https://mcp.granola.ai/mcp', name: 'granola' }],
    })

    const textBlock = listResp.content.find((b: any) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Granola sync')

    let raw = textBlock.text.trim().replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start === -1 || end === -1) throw new Error('No JSON array in response')
    raw = raw.slice(start, end + 1)

    const meetings: ExtractedMeeting[] = JSON.parse(raw)
    logs.push(`Extracted ${meetings.length} meetings`)

    let newMeetings = 0
    let newActions = 0

    for (const meeting of meetings) {
      // Upsert meeting
      const { data: existing } = await db
        .from('meetings')
        .select('id')
        .eq('granola_id', meeting.granola_id)
        .single()

      let meetingId: string

      if (existing) {
        meetingId = existing.id
        // Update summary in case it changed
        await db.from('meetings').update({
          summary: meeting.summary,
          title: meeting.title,
        }).eq('id', meetingId)
      } else {
        const { data: inserted, error } = await db.from('meetings').insert({
          granola_id: meeting.granola_id,
          title: meeting.title,
          meeting_date: meeting.meeting_date,
          participants: meeting.participants,
          summary: meeting.summary,
        }).select('id').single()

        if (error) { logs.push(`Error inserting meeting ${meeting.title}: ${error.message}`); continue }
        meetingId = inserted.id
        newMeetings++
      }

      // Insert new actions (skip if meeting already had actions synced)
      if (!existing) {
        for (const action of meeting.actions) {
          await db.from('actions').insert({
            meeting_id: meetingId,
            text: action.text,
            owner: action.owner,
            priority: action.priority,
            done: false,
          })
          newActions++
        }
      }
    }

    logs.push(`Sync complete: ${newMeetings} new meetings, ${newActions} new actions`)
    return { success: true, logs, newMeetings, newActions }
  } catch (err: any) {
    logs.push(`Sync error: ${err.message}`)
    return { success: false, logs, error: err.message }
  }
}
