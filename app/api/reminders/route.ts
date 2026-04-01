import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendSlackDM, buildReminderBlocks, buildDailySummaryBlocks } from '@/lib/slack'

export const maxDuration = 60

// GET = cron job at 9am: send daily summary + due reminders
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const userId = process.env.SLACK_USER_ID!
  const results: string[] = []

  try {
    // 1. Send daily summary
    const { data: allActions } = await db.from('actions').select('*')
    const total = allActions?.length ?? 0
    const done = allActions?.filter(a => a.done).length ?? 0
    const high = allActions?.filter(a => !a.done && a.priority === 'high').length ?? 0

    // Check how many new meetings were synced today
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { data: syncLog } = await db.from('sync_logs')
      .select('new_meetings')
      .gte('ran_at', today.toISOString())
      .order('ran_at', { ascending: false })
      .limit(1)
      .single()

    await sendSlackDM(userId, 'Good morning — your JMI Planner daily summary', buildDailySummaryBlocks({
      total, done, high, newMeetings: syncLog?.new_meetings ?? 0
    }))
    results.push('Daily summary sent')

    // 2. Send due reminders
    const now = new Date()
    const { data: dueReminders } = await db
      .from('reminders')
      .select('*, actions(text, meeting_id, meetings(title))')
      .lte('remind_at', now.toISOString())
      .eq('sent', false)

    if (dueReminders?.length) {
      const blocks = buildReminderBlocks(dueReminders.map((r: any) => ({
        text: r.message || r.actions?.text || 'Reminder',
        meeting: r.actions?.meetings?.title || 'Unknown meeting',
        due_at: r.remind_at,
      })))
      await sendSlackDM(userId, `You have ${dueReminders.length} reminder(s) due`, blocks)

      // Mark as sent
      await db.from('reminders').update({ sent: true, sent_at: now.toISOString() })
        .in('id', dueReminders.map((r: any) => r.id))
      results.push(`Sent ${dueReminders.length} reminders`)
    }

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST = create a reminder from the chatbot or UI
export async function POST(req: NextRequest) {
  const db = supabaseAdmin()
  const { action_id, remind_at, message } = await req.json()

  if (!remind_at || !message) {
    return NextResponse.json({ error: 'remind_at and message required' }, { status: 400 })
  }

  const { data, error } = await db.from('reminders').insert({
    action_id: action_id || null,
    remind_at,
    message,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
