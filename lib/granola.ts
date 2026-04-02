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

// Extract actions from a meeting summary using Claude
async function extractActions(meeting: { id: string; title: string; summary: string; date: string; participants: string[] }): Promise<ExtractedAction[]> {
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Extract ALL action items, next steps, follow-ups, and commitments from this meeting summary. Return ONLY a JSON array, no markdown:
[{"text": "action description", "owner": "person name or Both or Stuart", "priority": "high|medium|low"}]

Meeting: ${meeting.title}
Date: ${meeting.date}

Summary:
${meeting.summary}

If no actions, return [].`
    }]
  })

  const text = resp.content.find(b => b.type === 'text')?.text?.trim() || '[]'
  try {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start === -1) return []
    return JSON.parse(clean.slice(start, end + 1))
  } catch {
    return []
  }
}

export async function syncGranolaMeetings(
  timeRange: 'this_week' | 'last_week' | 'last_30_days' = 'last_30_days',
  meetingsData?: ExtractedMeeting[]
) {
  const db = supabaseAdmin()
  const logs: string[] = []
  let newMeetings = 0
  let newActions = 0

  try {
    logs.push(`Starting sync`)

    // If meetings data is passed in directly (from the sync route which calls Granola natively)
    const meetings = meetingsData || []
    logs.push(`Processing ${meetings.length} meetings`)

    for (const meeting of meetings) {
      const { data: existing } = await db
        .from('meetings')
        .select('id')
        .eq('granola_id', meeting.granola_id)
        .single()

      let meetingId: string

      if (existing) {
        meetingId = existing.id
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

        if (error) { logs.push(`Error inserting ${meeting.title}: ${error.message}`); continue }
        meetingId = inserted.id
        newMeetings++
      }

      // Extract and insert actions for new meetings
      if (!existing) {
        let actions = meeting.actions
        // If no actions pre-extracted, use Claude to extract them
        if (!actions || actions.length === 0) {
          actions = await extractActions({
            id: meeting.granola_id,
            title: meeting.title,
            summary: meeting.summary,
            date: meeting.meeting_date,
            participants: meeting.participants,
          })
        }
        for (const action of actions) {
          await db.from('actions').insert({
            meeting_id: meetingId,
            text: action.text,
            owner: action.owner || '',
            priority: action.priority || 'medium',
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
