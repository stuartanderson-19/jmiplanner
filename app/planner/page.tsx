import { supabaseAdmin } from '@/lib/supabase'
import PlannerClient from '@/components/PlannerClient'

export const revalidate = 0

export default async function PlannerPage() {
  const db = supabaseAdmin()

  const [{ data: meetings }, { data: actions }, { data: syncLog }] = await Promise.all([
    db.from('meetings').select('id, title, meeting_date, participants').order('meeting_date', { ascending: false }),
    db.from('actions').select('id, meeting_id, text, owner, priority, done, done_at, created_at').order('created_at', { ascending: false }),
    db.from('sync_logs').select('ran_at, new_meetings, new_actions, success').order('ran_at', { ascending: false }).limit(1).single(),
  ])

  return (
    <PlannerClient
      meetings={meetings ?? []}
      actions={actions ?? []}
      lastSync={syncLog ?? null}
    />
  )
}
