import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  const db = supabaseAdmin()
  const body = await req.json()
  const { id, done, text, priority, owner } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updates: any = {}
  if (typeof done === 'boolean') {
    updates.done = done
    updates.done_at = done ? new Date().toISOString() : null
  }
  if (text) updates.text = text
  if (priority) updates.priority = priority
  if (owner) updates.owner = owner

  const { data, error } = await db.from('actions').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin()
  const body = await req.json()
  const { meeting_id, text, owner = '', priority = 'medium' } = body

  if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 })

  const { data, error } = await db.from('actions').insert({
    meeting_id: meeting_id || null,
    text,
    owner,
    priority,
    done: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const db = supabaseAdmin()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await db.from('actions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
