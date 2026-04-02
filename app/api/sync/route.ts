import { NextRequest, NextResponse } from 'next/server'
import { syncGranolaMeetings, ExtractedMeeting } from '@/lib/granola'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ message: 'Cron sync requires meetings data to be pushed. Use POST with meetings array.' })
}

// POST accepts pre-fetched meetings from client or Claude.ai chat
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const timeRange = body.timeRange || 'last_30_days'
  const meetings: ExtractedMeeting[] = body.meetings || []

  if (!meetings.length) {
    return NextResponse.json({ 
      success: false, 
      error: 'No meetings provided. Pass meetings array in request body.',
      logs: ['No meetings data received']
    })
  }

  const db = supabaseAdmin()
  const result = await syncGranolaMeetings(timeRange, meetings)
  
  await db.from('sync_logs').insert({
    success: result.success,
    new_meetings: result.newMeetings ?? 0,
    new_actions: result.newActions ?? 0,
    logs: result.logs,
  })

  return NextResponse.json(result)
}
