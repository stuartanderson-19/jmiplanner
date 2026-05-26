import { NextRequest, NextResponse } from 'next/server'
import { syncGranolaMeetings, ExtractedMeeting } from '@/lib/granola'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  // This endpoint is designed to be called by Claude with a secret key
  const auth = req.headers.get('authorization')
  const secret = process.env.CLAUDE_SYNC_SECRET || process.env.CRON_SECRET || ''
  
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const meetings: ExtractedMeeting[] = body.meetings || []
  const timeRange = body.timeRange || 'last_30_days'

  if (!meetings.length) {
    return NextResponse.json({ success: false, error: 'No meetings provided' })
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
