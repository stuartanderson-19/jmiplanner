import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 120

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { messages, conversationHistory = [] } = await req.json()
  const db = supabaseAdmin()

  // Fetch current state of all actions + meetings for context
  const { data: meetings } = await db
    .from('meetings')
    .select('id, title, meeting_date, participants, summary')
    .order('meeting_date', { ascending: false })
    .limit(50)

  const { data: actions } = await db
    .from('actions')
    .select('id, meeting_id, text, owner, priority, done, done_at, created_at')
    .order('created_at', { ascending: false })

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const openActions = actions?.filter(a => !a.done) ?? []
  const doneActions = actions?.filter(a => a.done) ?? []
  const highPriority = openActions.filter(a => a.priority === 'high')

  // Build a meeting lookup for action context
  const meetingMap = Object.fromEntries((meetings ?? []).map(m => [m.id, m]))

  const contextBlock = `
TODAY: ${today}

=== CURRENT ACTION STATE ===
Total actions: ${actions?.length ?? 0}
Open: ${openActions.length} (${highPriority.length} high priority)
Completed: ${doneActions.length}

=== OPEN ACTIONS (by priority) ===
${['high', 'medium', 'low'].map(p => {
  const acts = openActions.filter(a => a.priority === p)
  if (!acts.length) return ''
  return `--- ${p.toUpperCase()} PRIORITY ---\n` + acts.map(a => {
    const mtg = a.meeting_id ? meetingMap[a.meeting_id] : null
    return `• [ID:${a.id}] ${a.text}${a.owner ? ` (${a.owner})` : ''}${mtg ? ` | Meeting: ${mtg.title}` : ''}`
  }).join('\n')
}).filter(Boolean).join('\n\n')}

=== RECENT MEETINGS ===
${(meetings ?? []).slice(0, 20).map(m => {
  const mActions = (actions ?? []).filter(a => a.meeting_id === m.id)
  const mOpen = mActions.filter(a => !a.done).length
  return `• ${new Date(m.meeting_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${m.title} (${mOpen} open actions)`
}).join('\n')}
`

  const systemPrompt = `You are Stuart's personal AI assistant for Just Move In (JMI). You have full access to Stuart's meeting notes, actions, and Slack.

${contextBlock}

=== YOUR CAPABILITIES ===
1. TICK OFF ACTIONS: When Stuart asks you to mark something done, respond with a JSON action block:
   <action>{"type":"mark_done","action_id":"UUID","text":"action text"}</action>
   You can match by partial text — find the closest matching action ID from the list above.

2. SET REMINDERS: When Stuart asks for a reminder, respond with:
   <action>{"type":"set_reminder","action_id":"UUID","message":"reminder text","remind_at":"ISO8601 datetime"}</action>
   Parse natural language times like "tomorrow morning" = 9am next day, "in 2 days" = 9am in 2 days.

3. ADD ACTIONS: When Stuart wants to add a new action:
   <action>{"type":"add_action","text":"action text","owner":"Stuart","priority":"high|medium|low"}</action>

4. QUERY GRANOLA: Use the Granola MCP tool to search meeting notes for specific details.

5. SEARCH SLACK: Use the Slack MCP to search messages.

=== STYLE ===
- Be concise and direct — Stuart is busy
- When you take an action, confirm it briefly ("Done — marked as complete")
- For queries, cite which meeting the info came from
- You can suggest related actions Stuart might want to know about
- If Stuart asks "what should I focus on today?", prioritise high-priority Stuart-owned open actions`

  try {
    const response = await (client.messages.create as any)({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: messages }
      ],
      betas: ['mcp-client-2025-04-04'],
      mcp_servers: [
        { type: 'url', url: process.env.GRANOLA_MCP_URL || 'https://mcp.granola.ai/mcp', name: 'granola' },
        { type: 'url', url: 'https://mcp.slack.com/mcp', name: 'slack' },
      ],
    })

    const textBlock = response.content.find((b: any) => b.type === 'text')
    const text = textBlock?.type === 'text' ? textBlock.text : ''

    // Parse embedded action blocks
    const actionMatches = [...text.matchAll(/<action>([\s\S]*?)<\/action>/g)]
    const parsedActions = []
    for (const match of actionMatches) {
      try { parsedActions.push(JSON.parse(match[1])) } catch {}
    }

    // Execute actions server-side
    const executionResults = []
    for (const action of parsedActions) {
      try {
        if (action.type === 'mark_done') {
          await db.from('actions').update({ done: true, done_at: new Date().toISOString() }).eq('id', action.action_id)
          executionResults.push({ type: 'mark_done', id: action.action_id, success: true })
        } else if (action.type === 'set_reminder') {
          await db.from('reminders').insert({
            action_id: action.action_id || null,
            remind_at: action.remind_at,
            message: action.message,
          })
          executionResults.push({ type: 'set_reminder', success: true })
        } else if (action.type === 'add_action') {
          await db.from('actions').insert({
            text: action.text,
            owner: action.owner || 'Stuart',
            priority: action.priority || 'medium',
            done: false,
          })
          executionResults.push({ type: 'add_action', success: true })
        }
      } catch (e: any) {
        executionResults.push({ type: action.type, success: false, error: e.message })
      }
    }

    // Clean action tags from display text
    const cleanText = text.replace(/<action>[\s\S]*?<\/action>/g, '').trim()

    return NextResponse.json({
      text: cleanText,
      actions: parsedActions,
      executionResults,
      usage: response.usage,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
