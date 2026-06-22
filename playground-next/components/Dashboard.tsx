'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'

const RENDER_URL = 'https://greenprompts-bvdh.onrender.com'

const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:8000'
      : RENDER_URL
  }
  return RENDER_URL
}

const TIER_MODEL = { SLM: 'Llama 3.2 3B', MID: 'Llama 3.1 8B', FULL: 'Llama 3.3 70B' }

interface Analysis {
  tier: string
  reason: string
  estimates: Record<string, {
    green_score: string
    energy_index: number
    co2_g: number
    water_ml?: number
  }>
  recommended_model?: string
  suggested_models?: string[]
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface DashboardProps {
  showHero: boolean
  initialPrompt?: string
}

export default function Dashboard({ showHero, initialPrompt }: DashboardProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt)
    }
  }, [initialPrompt])

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTo({ top: chatAreaRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  const resizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px'
    }
  }

  const escapeHtml = (s: string) => {
    return String(s).replace(/[&<>"']/g, (c) => {
      const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
      return map[c]
    })
  }

  const parseMarkdown = (text: string): string => {
    const raw = String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const lines = raw.split('\n')
    let html = ''
    let inUl = false, inOl = false, inCode = false

    const inlineFormat = (s: string) => {
      return s
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    }

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]

      if (/^```/.test(line)) {
        if (inCode) { html += '</code></pre>'; inCode = false }
        else { html += '<pre><code>'; inCode = true }
        continue
      }
      if (inCode) { html += line + '\n'; continue }

      if (inUl && !/^[-*+]\s/.test(line)) { html += '</ul>'; inUl = false }
      if (inOl && !/^\d+\.\s/.test(line)) { html += '</ol>'; inOl = false }

      if (/^### /.test(line)) { html += `<h4 class="md-h">${line.slice(4)}</h4>`; continue }
      if (/^## /.test(line))  { html += `<h3 class="md-h">${line.slice(3)}</h3>`; continue }
      if (/^# /.test(line))   { html += `<h2 class="md-h">${line.slice(2)}</h2>`; continue }

      if (/^[-*+]\s/.test(line)) {
        if (!inUl) { html += '<ul class="md-ul">'; inUl = true }
        html += `<li>${inlineFormat(line.slice(2))}</li>`; continue
      }
      if (/^\d+\.\s/.test(line)) {
        if (!inOl) { html += '<ol class="md-ol">'; inOl = true }
        html += `<li>${inlineFormat(line.replace(/^\d+\.\s/, ''))}</li>`; continue
      }

      if (line.trim() === '') { html += '<br>'; continue }

      html += `<p class="md-p">${inlineFormat(line)}</p>`
    }

    if (inUl) html += '</ul>'
    if (inOl) html += '</ol>'
    if (inCode) html += '</code></pre>'
    return html
  }

  const go = async () => {
    const p = prompt.trim()
    if (!p || busy) return

    setBusy(true)
    setMessages(prev => [...prev, { role: 'user', content: p }])
    setPrompt('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const res = await fetch(`${getApiUrl()}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p, messages }),
      })
      const data = await res.json()
      setAnalysis(data)
      setMessages(prev => [...prev, { role: 'assistant', content: 'analysis', analysisData: data }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to GreenPrompt backend.' }])
    } finally {
      setBusy(false)
    }
  }

  const runModel = async () => {
    if (!analysis || busy) return

    setBusy(true)
    setMessages(prev => [...prev, { role: 'assistant', content: 'Analyzing impact...' }])

    try {
      const res = await fetch(`${getApiUrl()}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: messages[messages.length - 2]?.content, tier: analysis.tier, messages }),
      })

      let data
      try {
        data = await res.json()
      } catch (e) {
        data = { error: 'Parse Error', message: 'Failed to parse API response' }
      }

      setMessages(prev => {
        const newMessages = prev.slice(0, -1)
        return [...newMessages, { role: 'assistant', content: 'response', responseData: data }]
      })
    } catch (err) {
      setMessages(prev => {
        const newMessages = prev.slice(0, -1)
        return [...newMessages, { role: 'assistant', content: 'response', responseData: { error: 'Network Error', message: 'Could not reach the routing backend.' } }]
      })
    } finally {
      setBusy(false)
    }
  }

  const renderTierGrid = (d: Analysis) => {
    const { tier, estimates, recommended_model, suggested_models, reason } = d

    const tierRows = ['SLM', 'MID', 'FULL'].map(t => {
      const e = estimates[t]
      const best = t === tier
      const sc = `s-${e.green_score.toLowerCase()}`
      return (
        <div key={t} className={`tier-col ${best ? 'best' : ''} ${sc}-card`}>
          <div className="font-code" style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.25rem' }}>{t}</div>
          <div className={`t-score ${sc}`}>{e.green_score}</div>
          <div className="t-metric">{e.energy_index.toLocaleString()}J</div>
          <div className="t-metric">{e.co2_g.toFixed(3)}g CO2</div>
          <div className="t-metric">{(e.water_ml || 0).toFixed(1)}ml H₂O</div>
        </div>
      )
    })

    const altChips = (suggested_models || []).map((m, i) => (
      <span key={i} className="alt-chip">{escapeHtml(m)}</span>
    ))

    return (
      <div className="analysis-bubble">
        <div className="tier-grid">{tierRows}</div>
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
          {recommended_model && (
            <div className="rec-model">⚡ Recommended: <strong>{escapeHtml(recommended_model)}</strong></div>
          )}
          <p style={{ fontSize: '0.9rem', margin: '0.75rem 0 1rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>{escapeHtml(reason)}</p>
          {altChips.length > 0 && (
            <div className="alt-models">
              <span className="alt-label">Also fits:</span>
              {altChips}
            </div>
          )}
          <button 
            className="action-btn" 
            onClick={runModel}
            style={{ background: 'white', color: 'black', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', width: '100%', justifyContent: 'center', fontWeight: 600, marginTop: '1rem', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
          >
            Deploy to {escapeHtml(recommended_model || TIER_MODEL[tier as keyof typeof TIER_MODEL])}
          </button>
        </div>
      </div>
    )
  }

  const renderResponse = (rd: any) => {
    const isError = rd.error || !rd.response

    if (isError) {
      return (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: '1rem', width: '100%' }}>
          <div style={{ fontWeight: 700, fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.25rem' }}>ERROR DEPLOYING MODEL</div>
          <div style={{ fontSize: '0.95rem', color: '#ef4444' }}>{escapeHtml(rd.message || rd.error || 'Unknown API error.')}</div>
        </div>
      )
    }

    const mdContent = parseMarkdown(rd.response || '')
    return (
      <div className="response-card">
        <div className="response-meta">
          <span className="resp-model">{escapeHtml(rd.model_used)}</span>
          <span className="resp-time">{rd.response_time_ms}ms</span>
        </div>
        <div className="md-body" dangerouslySetInnerHTML={{ __html: mdContent }} />
      </div>
    )
  }

  return (
    <section className="dashboard-wrapper">
      <div className="glass-dashboard">
        {messages.length > 0 && (
          <div ref={chatAreaRef} style={{ maxHeight: '500px', overflowY: 'auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', borderBottom: '1px solid var(--glass-border)', scrollBehavior: 'smooth' }}>
            {messages.map((msg, i) => {
              if (msg.role === 'user') {
                return (
                  <div key={i} className="message user">
                    <div className="user-bubble">{escapeHtml(msg.content)}</div>
                  </div>
                )
              }

              if (msg.content === 'analysis' && (msg as any).analysisData) {
                return (
                  <div key={i} className="message bot">
                    <div className="bot-avatar">🌿</div>
                    {renderTierGrid((msg as any).analysisData)}
                  </div>
                )
              }

              if (msg.content === 'response' && (msg as any).responseData) {
                return (
                  <div key={i} className="message bot">
                    <div className="bot-avatar">🤖</div>
                    {renderResponse((msg as any).responseData)}
                  </div>
                )
              }

              if (msg.content === 'Analyzing impact...') {
                return (
                  <div key={i} className="message bot">
                    <div className="bot-avatar">🌿</div>
                    <div className="glass-card" style={{ background: 'none', border: 'none', padding: '0.75rem', fontSize: '0.9rem', opacity: 0.7 }}>
                      Analyzing impact...
                    </div>
                  </div>
                )
              }

              return (
                <div key={i} className="message bot">
                  <div className="bot-avatar">🌿</div>
                  <div style={{ color: '#ef4444' }}>{msg.content}</div>
                </div>
              )
            })}
          </div>
        )}

        <div className="input-section">
          <div className="textarea-container">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value)
                resizeTextarea()
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault()
                  go()
                }
              }}
              placeholder="Ask anything — GreenPrompt routes it to the greenest model..."
              rows={1}
            />
          </div>
          <div className="input-actions">
            <span className="input-hint">
              <span className="input-hint-dot"></span>
              Optimizing · Routing best path
            </span>
            <button 
              className="send-button" 
              onClick={go}
              disabled={busy}
              title="Analyze Prompt"
            >
              {busy ? <Loader2 size={20} className="spin" /> : <ArrowUp size={20} />}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
