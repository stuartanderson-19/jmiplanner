import { NextRequest, NextResponse } from 'next/server'
import { syncGranolaMeetings, ExtractedMeeting } from '@/lib/granola'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    success: false,
    error: 'Cron sync not yet configured. Use POST with meetings data.',
    logs: []
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const meetings: ExtractedMeeting[] = body.meetings || []
  const timeRange = body.timeRange || 'last_30_days'

  if (!meetings.length) {
    return NextResponse.json({
      success: false,
      needsData: true,
      message: 'No meetings provided. This planner syncs via Claude.ai — ask Claude to sync your meetings.',
      logs: []
    }, { status: 200 })
  }

  const db = supabaseAdmin()
  const result = await syncGranolaMeetings(timeRange as any, meetings)

  await db.from('sync_logs').insert({
    success: result.success,
    new_meetings: result.newMeetings ?? 0,
    new_actions: result.newActions ?? 0,
    logs: result.logs,
  })

  return NextResponse.json(result)
}
