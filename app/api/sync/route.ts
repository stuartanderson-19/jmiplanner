import { NextRequest, NextResponse } from 'next/server'
import { syncGranolaMeetings } from '@/lib/granola'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300 // 5 minutes for large syncs

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const result = await syncGranolaMeetings('last_30_days')

  // Log to DB
  await db.from('sync_logs').insert({
    success: result.success,
    new_meetings: result.newMeetings ?? 0,
    new_actions: result.newActions ?? 0,
    logs: result.logs,
  })

  return NextResponse.json(result)
}

// Also allow manual POST trigger from dashboard
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const timeRange = body.timeRange || 'last_30_days'
  const result = await syncGranolaMeetings(timeRange)

  const db = supabaseAdmin()
  await db.from('sync_logs').insert({
    success: result.success,
    new_meetings: result.newMeetings ?? 0,
    new_actions: result.newActions ?? 0,
    logs: result.logs,
  })

  return NextResponse.json(result)
}
