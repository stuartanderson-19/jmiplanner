import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 120

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { messages, conversationHistory = [] } = await req.json()
  const db = supabaseAdmin()

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
  const meetingMap = Object.fromEntries((meetings ?? []).map(m => [m.id, m]))

  const contextBlock = `
TODAY: ${today}
Total actions: ${actions?.length ?? 0} | Open: ${openActions.length} (${highPriority.length} high priority) | Done: ${doneActions.length}

=== OPEN ACTIONS ===
${['high', 'medium', 'low'].map(p => {
  const acts = openActions.filter(a => a.priority === p)
  if (!acts.length) return ''
  return `--- ${p.toUpperCase()} ---\n` + acts.map(a => {
    const mtg = a.meeting_id ? meetingMap[a.meeting_id] : null
    return `• [ID:${a.id}] ${a.text}${a.owner ? ` (${a.owner})` : ''}${mtg ? ` | ${mtg.title}` : ''}`
  }).join('\n')
}).filter(Boolean).join('\n\n')}

=== RECENT MEETINGS ===
${(meetings ?? []).slice(0, 20).map(m => {
  const mActions = (actions ?? []).filter(a => a.meeting_id === m.id)
  const mOpen = mActions.filter(a => !a.done).length
  return `• ${new Date(m.meeting_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — ${m.title} (${mOpen} open actions)\n  Summary: ${m.summary?.slice(0, 200) || 'No summary'}`
}).join('\n')}
`

  const systemPrompt = `You are Stuart's personal AI assistant for Just Move In (JMI). You have full context of his meetings and actions.

${contextBlock}

=== YOUR CAPABILITIES ===
1. TICK OFF ACTIONS: When Stuart asks to mark something done, respond with:
   <action>{"type":"mark_done","action_id":"UUID","text":"action text"}</action>
   Match by partial text — find the closest matching action ID from the list above.

2. SET REMINDERS: When Stuart asks for a reminder:
   <action>{"type":"set_reminder","action_id":"UUID","message":"reminder text","remind_at":"ISO8601 datetime"}</action>
   Parse natural times: "tomorrow morning" = 9am next day, "in 2 days" = 9am in 2 days.

3. ADD ACTIONS: When Stuart wants to add a new action:
   <action>{"type":"add_action","text":"action text","owner":"Stuart","priority":"high|medium|low"}</action>

4. ANSWER QUESTIONS: Use the meeting summaries above to answer questions about what was discussed, agreed, or decided.

=== STYLE ===
- Be concise and direct
- Confirm actions briefly ("Done — marked as complete")
- Cite which meeting info came from
- If asked "what should I focus on today?", list high-priority Stuart-owned open actions`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: messages }
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const text = textBlock?.type === 'text' ? textBlock.text : ''

    const actionMatches = [...text.matchAll(/<action>(.*?)<\/action>/gs)]
    const parsedActions = []
    for (const match of actionMatches) {
      try { parsedActions.push(JSON.parse(match[1])) } catch {}
    }

    const executionResults = []
    for (const action of parsedActions) {
      try {
        if (action.type === 'mark_done') {
          await db.from('actions').update({ done: true, done_at: new Date().toISOString() }).eq('id', action.action_id)
          executionResults.push({ type: 'mark_done', id: action.action_id, success: true })
        } else if (action.type === 'set_reminder') {
          await db.from('reminders').insert({ action_id: action.action_id || null, remind_at: action.remind_at, message: action.message })
          executionResults.push({ type: 'set_reminder', success: true })
        } else if (action.type === 'add_action') {
          await db.from('actions').insert({ text: action.text, owner: action.owner || 'Stuart', priority: action.priority || 'medium', done: false })
          executionResults.push({ type: 'add_action', success: true })
        }
      } catch (e: any) {
        executionResults.push({ type: action.type, success: false, error: e.message })
      }
    }

    const cleanText = text.replace(/<action>.*?<\/action>/gs, '').trim()
    return NextResponse.json({ text: cleanText, actions: parsedActions, executionResults, usage: response.usage })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
