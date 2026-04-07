'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, RefreshCw,
  MessageSquare, X, Send, Loader2, AlertCircle, Bell,
  TrendingUp, ListTodo, Zap, Calendar, Filter
} from 'lucide-react'

interface Meeting { id: string; title: string; meeting_date: string; participants: string[] }
interface Action { id: string; meeting_id: string | null; text: string; owner: string; priority: 'high' | 'medium' | 'low'; done: boolean; done_at: string | null; created_at: string }
interface SyncLog { ran_at: string; new_meetings: number; new_actions: number; success: boolean }
interface ChatMessage { role: 'user' | 'assistant'; content: string; actions?: any[] }

const P_COLORS = {
  high: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
}

const MTG_COLORS = ['#2f5de8','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#be185d','#059669','#ea580c','#4338ca']

export default function PlannerClient({ meetings, actions: initActions, lastSync }: {
  meetings: Meeting[]; actions: Action[]; lastSync: SyncLog | null
}) {
  const [actions, setActions] = useState<Action[]>(initActions)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filterOwner, setFilterOwner] = useState<'all'|'stuart'|'others'>('all')
  const [filterPri, setFilterPri] = useState<'all'|'high'|'medium'|'low'>('all')
  const [showDone, setShowDone] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string|null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMessage[]>([{ role: 'assistant', content: "Hi Stuart! I can tick off actions, set Slack reminders, search your meeting notes, or help you decide what to focus on. What do you need?" }])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const colorMap = Object.fromEntries(meetings.map((m, i) => [m.id, MTG_COLORS[i % MTG_COLORS.length]]))

  const open = actions.filter(a => !a.done)
  const done = actions.filter(a => a.done)
  const highOpen = open.filter(a => a.priority === 'high')
  const pct = actions.length ? Math.round(done.length / actions.length * 100) : 0

  const filterActs = (acts: Action[]) => acts.filter(a => {
    if (!showDone && a.done) return false
    const ow = a.owner.toLowerCase()
    if (filterOwner === 'stuart' && !ow.includes('stuart') && ow !== 'both') return false
    if (filterOwner === 'others' && (ow.includes('stuart') || ow === 'both')) return false
    if (filterPri !== 'all' && a.priority !== filterPri) return false
    return true
  })

  const toggleDone = useCallback(async (action: Action) => {
    const nd = !action.done
    setActions(prev => prev.map(a => a.id === action.id ? { ...a, done: nd, done_at: nd ? new Date().toISOString() : null } : a))
    await fetch('/api/actions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: action.id, done: nd }) })
  }, [])

  const toggleMtg = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeRange: 'last_30_days' }),
      })
      const d = await res.json()
      if (d.needsData) {
        setSyncMsg('To sync, open Claude.ai and say "sync my planner" — Claude will pull your Granola meetings automatically.')
      } else if (d.success) {
        setSyncMsg(d.newMeetings > 0
          ? `Synced ${d.newMeetings} new meeting${d.newMeetings !== 1 ? 's' : ''} and ${d.newActions} new action${d.newActions !== 1 ? 's' : ''}`
          : 'Already up to date'
        )
        if (d.newMeetings > 0) setTimeout(() => window.location.reload(), 1500)
      } else {
        setSyncMsg(`Sync error: ${d.error || 'unknown error'}`)
      }
    } catch {
      setSyncMsg('Sync failed — check connection')
    }
    setSyncing(false)
  }

  const sendChat = async () => {
    if (!input.trim() || chatLoading) return
    const msg = input.trim(); setInput('')
    setMsgs(prev => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msg, conversationHistory: history }) })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setMsgs(prev => [...prev, { role: 'assistant', content: d.text, actions: d.actions }])
      setHistory(prev => [...prev, { role: 'user', content: msg }, { role: 'assistant', content: d.text }])
      if (d.executionResults?.length) {
        for (const ex of d.executionResults) {
          if (ex.type === 'mark_done' && ex.success && ex.id) {
            setActions(prev => prev.map(a => a.id === ex.id ? { ...a, done: true, done_at: new Date().toISOString() } : a))
          }
        }
      }
    } catch (e: any) {
      setMsgs(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${e.message}` }])
    }
    setChatLoading(false)
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => { if (chatOpen) setTimeout(() => inputRef.current?.focus(), 100) }, [chatOpen])

  const grouped = meetings.map(m => ({
    m, acts: filterActs(actions.filter(a => a.meeting_id === m.id)),
    total: actions.filter(a => a.meeting_id === m.id),
  })).filter(g => g.acts.length > 0)

  const standalone = filterActs(actions.filter(a => !a.meeting_id))

  const SUGGESTED = ["What should I focus on today?", "What did we agree with Let Tech?", "Remind me about British Gas tomorrow 9am", "Mark the Fabio action as done"]

  return (
    <div className="min-h-screen bg-surface-2">
      <nav className="bg-white border-b border-surface-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
              <ListTodo size={14} className="text-white" />
            </div>
            <span className=" text-lg text-ink-primary">JMI Planner</span>
            <span className="text-ink-muted text-sm hidden sm:block">· {format(new Date(), 'EEE d MMM')}</span>
          </div>
          <div className="flex items-center gap-2">
            {lastSync && <span className="text-xs text-ink-tertiary hidden sm:block">Synced {formatDistanceToNow(new Date(lastSync.ran_at), { addSuffix: true })}</span>}
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-surface-3 bg-white text-ink-secondary hover:bg-surface-1 transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync Granola'}
            </button>
            <button onClick={() => setChatOpen(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-800 transition-colors">
              <MessageSquare size={12} />Ask AI
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {syncMsg && (
          <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm flex items-start gap-2 ${
            syncMsg.startsWith('Sync error') ? 'bg-red-50 text-red-700 border border-red-200' :
            syncMsg.startsWith('To sync') ? 'bg-blue-50 text-blue-700 border border-blue-200' :
            'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {syncMsg.startsWith('Sync error') ? <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> : <Zap size={14} className="flex-shrink-0 mt-0.5" />}
            {syncMsg}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Meetings', value: meetings.length, icon: <Calendar size={14} />, col: 'text-brand-600' },
            { label: 'Open actions', value: open.length, icon: <ListTodo size={14} />, col: 'text-ink-secondary' },
            { label: 'High priority', value: highOpen.length, icon: <AlertCircle size={14} />, col: 'text-red-500' },
            { label: 'Completed', value: `${done.length} (${pct}%)`, icon: <TrendingUp size={14} />, col: 'text-emerald-600', bar: true },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-surface-3 p-4">
              <div className={`flex items-center gap-1.5 text-xs mb-2 ${s.col}`}>{s.icon}<span className="text-ink-tertiary">{s.label}</span></div>
              <div className="text-2xl font-semibold text-ink-primary ">{s.value}</div>
              {s.bar && <div className="mt-2 h-1 bg-surface-3 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex items-center gap-1 text-xs text-ink-tertiary"><Filter size={11} /><span>Filter:</span></div>
          {(['all','stuart','others'] as const).map(o => (
            <button key={o} onClick={() => setFilterOwner(o)} className={`text-xs px-3 py-1 rounded-lg border transition-colors ${filterOwner === o ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-secondary border-surface-3 hover:border-brand-200'}`}>
              {o === 'all' ? 'All owners' : o === 'stuart' ? 'Mine' : 'Others'}
            </button>
          ))}
          <div className="w-px h-4 bg-surface-3" />
          {(['all','high','medium','low'] as const).map(p => (
            <button key={p} onClick={() => setFilterPri(p)} className={`text-xs px-3 py-1 rounded-lg border transition-colors ${filterPri === p ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-secondary border-surface-3 hover:border-brand-200'}`}>
              {p === 'all' ? 'All priorities' : p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
          <div className="w-px h-4 bg-surface-3" />
          <button onClick={() => setShowDone(!showDone)} className={`text-xs px-3 py-1 rounded-lg border transition-colors ${showDone ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-ink-secondary border-surface-3 hover:border-brand-200'}`}>
            {showDone ? 'Hide done' : 'Show done'}
          </button>
        </div>

        <div className="space-y-3">
          {grouped.length === 0 && standalone.length === 0 && (
            <div className="bg-white rounded-2xl border border-surface-3 p-12 text-center">
              <p className="text-ink-tertiary text-sm">No actions match your filters. Try syncing Granola or adjusting filters.</p>
            </div>
          )}
          {grouped.map(({ m, acts, total }) => {
            const exp = expanded.has(m.id)
            const doneCt = total.filter(a => a.done).length
            return (
              <div key={m.id} className="bg-white rounded-2xl border border-surface-3 overflow-hidden">
                <button onClick={() => toggleMtg(m.id)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-1 transition-colors text-left">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorMap[m.id] }} />
                  <span className="font-medium text-ink-primary flex-1 text-sm truncate">{m.title}</span>
                  <span className="text-xs text-ink-tertiary flex-shrink-0">{format(new Date(m.meeting_date), 'd MMM')}</span>
                  <span className="text-xs text-ink-muted ml-2 flex-shrink-0">{doneCt}/{total.length}</span>
                  {exp ? <ChevronUp size={14} className="text-ink-muted flex-shrink-0" /> : <ChevronDown size={14} className="text-ink-muted flex-shrink-0" />}
                </button>
                {exp && <div className="border-t border-surface-2">{acts.map((a, i) => <ActionRow key={a.id} action={a} onToggle={toggleDone} isLast={i === acts.length - 1} />)}</div>}
              </div>
            )
          })}
          {standalone.length > 0 && (
            <div className="bg-white rounded-2xl border border-surface-3 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-2">
                <div className="w-2.5 h-2.5 rounded-full bg-ink-muted" />
                <span className="font-medium text-ink-primary text-sm flex-1">Ad-hoc actions</span>
                <span className="text-xs text-ink-muted">{standalone.length}</span>
              </div>
              {standalone.map((a, i) => <ActionRow key={a.id} action={a} onToggle={toggleDone} isLast={i === standalone.length - 1} />)}
            </div>
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-[420px] bg-white shadow-2xl border-l border-surface-3 z-30 flex flex-col transition-transform duration-300 ease-in-out ${chatOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center"><MessageSquare size={14} className="text-white" /></div>
          <div className="flex-1">
            <div className="text-sm font-medium text-ink-primary">JMI Assistant</div>
            <div className="text-xs text-ink-tertiary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
              Granola · Slack · Actions
            </div>
          </div>
          <button onClick={() => setChatOpen(false)} className="text-ink-tertiary hover:text-ink-primary"><X size={18} /></button>
        </div>

        {msgs.length <= 1 && (
          <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2">
            {SUGGESTED.map(p => (
              <button key={p} onClick={() => { setInput(p); setTimeout(() => inputRef.current?.focus(), 50) }}
                className="text-xs px-3 py-1.5 rounded-xl bg-surface-1 border border-surface-3 text-ink-secondary hover:border-brand-200 hover:text-brand-600 transition-colors text-left">
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {msgs.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                  <Zap size={11} className="text-brand-600" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-surface-1 text-ink-primary rounded-tl-sm border border-surface-3'}`}>
                {msg.content.split('\n').map((line, j) => <p key={j} className="mb-1 last:mb-0">{line || <>&nbsp;</>}</p>)}
                {msg.actions?.map((a: any, j: number) => (
                  <div key={j} className="mt-2 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <CheckCircle2 size={11} />
                    {a.type === 'mark_done' ? 'Action marked as done' : a.type === 'set_reminder' ? 'Reminder set — you\'ll get a Slack DM' : a.type === 'add_action' ? 'Action added to your list' : a.type}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center mr-2 flex-shrink-0"><Zap size={11} className="text-brand-600" /></div>
              <div className="bg-surface-1 border border-surface-3 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-4">
                  {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-ink-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-surface-2 px-4 py-3 flex-shrink-0">
          <div className="flex gap-2 items-center">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Ask about your meetings…"
              className="flex-1 text-sm bg-surface-1 border border-surface-3 rounded-xl px-4 py-2.5 text-ink-primary placeholder-ink-muted outline-none focus:border-brand-400 transition-colors" />
            <button onClick={sendChat} disabled={!input.trim() || chatLoading}
              className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white hover:bg-brand-800 transition-colors disabled:opacity-40 flex-shrink-0">
              {chatLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-2 text-center">Tick actions · Set reminders · Search Granola & Slack</p>
        </div>
      </div>

      {chatOpen && <div className="fixed inset-0 bg-black/20 z-20 sm:hidden" onClick={() => setChatOpen(false)} />}
    </div>
  )
}

function ActionRow({ action, onToggle, isLast }: { action: Action; onToggle: (a: Action) => void; isLast: boolean }) {
  const p = P_COLORS[action.priority]
  return (
    <div onClick={() => onToggle(action)} className={`flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-surface-1 transition-colors ${!isLast ? 'border-b border-surface-2' : ''}`}>
      <div className="mt-0.5 flex-shrink-0">{action.done ? <CheckCircle2 size={16} className="text-brand-400" /> : <Circle size={16} className="text-ink-muted" />}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${action.done ? 'line-through text-ink-muted' : 'text-ink-primary'}`}>{action.text}</p>
        {action.owner && !action.done && <p className="text-xs text-ink-tertiary mt-0.5">{action.owner}</p>}
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-md border flex-shrink-0 mt-0.5 ${p.bg} ${p.text} ${p.border}`}>{action.priority}</span>
    </div>
  )
}
