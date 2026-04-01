'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Loader2, CheckCircle2, Bell, Plus, MessageSquare } from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string; actions?: any[] }

const SUGGESTIONS = [
  "What should I focus on today?",
  "Mark the Fabio MRCV action as done",
  "What did we agree with E-surv?",
  "Remind me about BG Void Terms tomorrow at 9am",
  "Search Slack for anything about British Gas",
  "Show me all high priority Stuart actions",
]

export default function ChatPanel({ onClose, onActionsChanged }: {
  onClose: () => void
  onActionsChanged: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hi Stuart 👋 I have full visibility of your actions, meetings, and notes. I can:\n\n• **Tick off actions** — just tell me what's done\n• **Set Slack reminders** — "remind me about X tomorrow at 9am"\n• **Query your notes** — "what did we agree with E-surv?"\n• **Search Slack** — "find the thread about British Gas"\n\nWhat do you need?`
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<{ role: string; content: string }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')

    const userMsg: Message = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msg, conversationHistory: history }),
      })
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.text,
        actions: data.executionResults,
      }
      setMessages(prev => [...prev, assistantMsg])

      // Update conversation history
      setHistory(prev => [
        ...prev,
        { role: 'user', content: msg },
        { role: 'assistant', content: data.text },
      ])

      // If actions were executed, refresh the planner
      if (data.executionResults?.length > 0) {
        onActionsChanged()
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, history, onActionsChanged])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-end sm:p-5 pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 pointer-events-auto" onClick={onClose} />

      {/* Panel */}
      <div className="relative pointer-events-auto w-full sm:w-[420px] h-[85vh] sm:h-[680px] bg-white rounded-t-2xl sm:rounded-2xl border border-surface-3 shadow-2xl flex flex-col overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-2 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">J</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-primary">Ask J</div>
              <div className="text-xs text-ink-tertiary flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse-dot" />
                Connected to Granola · Slack
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-1 text-ink-tertiary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${msg.role === 'user'
                ? 'bg-brand-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5'
                : 'bg-surface-1 text-ink-primary rounded-2xl rounded-tl-sm px-3.5 py-2.5 border border-surface-3'
              }`}>
                <div className="text-sm leading-relaxed chat-prose" dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {msg.actions.map((a, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs bg-white/80 rounded-lg px-2.5 py-1.5 border border-surface-3">
                        {a.type === 'mark_done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                        {a.type === 'set_reminder' && <Bell className="w-3.5 h-3.5 text-brand-600 flex-shrink-0" />}
                        {a.type === 'add_action' && <Plus className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                        <span className="text-ink-secondary">
                          {a.type === 'mark_done' && 'Action marked complete'}
                          {a.type === 'set_reminder' && 'Reminder set in Slack'}
                          {a.type === 'add_action' && 'Action added'}
                        </span>
                        <span className={`ml-auto font-medium ${a.success ? 'text-emerald-600' : 'text-red-500'}`}>
                          {a.success ? '✓' : '✗'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface-1 border border-surface-3 rounded-2xl rounded-tl-sm px-3.5 py-3 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-tertiary" />
                <span className="text-xs text-ink-tertiary">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions (show when only 1 message) */}
        {messages.length === 1 && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
            {SUGGESTIONS.slice(0, 4).map(s => (
              <button key={s} onClick={() => sendMessage(s)}
                className="text-xs bg-surface-1 border border-surface-3 text-ink-secondary px-2.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors text-left">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-surface-2">
          <div className="flex items-end gap-2 bg-surface-1 rounded-xl border border-surface-3 px-3 py-2 focus-within:border-brand-400 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your meetings…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-ink-primary placeholder-ink-muted resize-none outline-none leading-relaxed max-h-32"
              style={{ minHeight: 24 }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-7 h-7 bg-brand-600 text-white rounded-lg flex items-center justify-center hover:bg-brand-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-1.5 text-center">Shift+Enter for new line · Enter to send</p>
        </div>
      </div>
    </div>
  )
}

function formatMessage(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^• /gm, '&bull; ')
    .replace(/\n/g, '<br />')
}
