import { NextRequest, NextResponse } from 'next/server'
import { syncGranolaMeetings, ExtractedMeeting } from '@/lib/granola'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300

// Allow Claude to call this from anywhere using a shared secret
const SYNC_SECRET = process.env.SYNC_SECRET || process.env.CRON_SECRET || ''

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${SYNC_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    success: false,
    error: 'Cron sync not yet configured. Use POST with meetings data.',
    logs: []
  })
}

export async function POST(req: NextRequest) {
  // Accept calls from Claude (with secret) OR from same-origin (browser button)
  const auth = req.headers.get('authorization')
  const origin = req.headers.get('origin') || ''
  const isSameOrigin = origin.includes('jmiplanner.vercel.app') || origin.includes('localhost')
  const hasValidSecret = SYNC_SECRET && auth === `Bearer ${SYNC_SECRET}`

  if (!isSameOrigin && !hasValidSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
