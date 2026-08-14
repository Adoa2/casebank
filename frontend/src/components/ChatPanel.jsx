import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from '../api/authToken'
import caseyImage from '../assets/casey_perfil.png'

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '¡Hola! Soy Casey, tu asistente virtual de CaseBank. Estoy aquí para ayudarte a resolver tus dudas sobre el uso de casebank basado en el manual.',
    fuentes: [],
  },
]

const SUGGESTED_QUESTIONS = [
  { text: '¿Cómo registro un cooperativista/socio?', icon: 'users', color: 'emerald' },
  { text: '¿Cómo crear una cuenta de ahorros a un socio?', icon: 'users', color: 'emerald' },
  { text: '¿Cómo generar un estado financiero?', icon: 'users', color: 'emerald' },
]

function SuggestedIcon({ icon }) {
  if (icon === 'users') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19v-1a5 5 0 0 1 10 0v1M16 6a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5" />
      </svg>
    )
  }

  if (icon === 'warning') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 3 2.5 20h19L12 3Z" />
        <path d="M12 9v5M12 17.5v.01" />
      </svg>
    )
  }

  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" />
    </svg>
  )
}

function renderTextoConNegritas(texto) {
  const partes = texto.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g)
  return partes.map((parte, idx) => {
    if (parte.startsWith('**') && parte.endsWith('**')) {
      return <strong key={idx}>{parte.slice(2, -2)}</strong>
    }
    if (/^https?:\/\//.test(parte)) {
      return (
        <a
          key={idx}
          href={parte}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-blue underline hover:no-underline break-all"
        >
          {parte}
        </a>
      )
    }
    return <span key={idx}>{parte}</span>
  })
}

function formatearRangoPaginas(fuente) {
  if (fuente.pagina_fin && fuente.pagina_fin !== fuente.pagina) {
    return `${fuente.pagina}–${fuente.pagina_fin}`
  }
  return fuente.pagina
}

export default function ChatPanel({ onSelectSource, onCollapse }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })

    return () => cancelAnimationFrame(frame)
  }, [messages, loading])

  function handleClear() {
    setMessages([...INITIAL_MESSAGES])
  }

  async function sendMessage(value) {
    const text = value.trim()
    if (!text || loading) return
    if (text.length < 3) {
      const userMessage = { id: `u-${Date.now()}`, role: 'user', text }
      const avisoMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        text: 'Disculpa, ¿podrías darme un mayor contexto de tu pregunta?',
        fuentes: [],
      }
      setMessages((prev) => [...prev, userMessage, avisoMessage])
      setDraft('')
      return
    }

    const userMessage = { id: `u-${Date.now()}`, role: 'user', text }
    setMessages((prev) => [...prev, userMessage])
    setDraft('')
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ pregunta: text }),
      })

      const data = await parseApiResponse(res)
      const assistantMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.respuesta,
        fuentes: data.fuentes || [],
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      const errorMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        text: err.message || 'Ocurrió un error al consultar el asistente.',
        fuentes: [],
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  function handleSend(e) {
    e.preventDefault()
    sendMessage(draft)
  }

  return (
    <aside className="w-full h-full flex flex-col bg-white">
      <div className="flex items-start gap-3 border-b border-line px-5 py-5">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-blue-100 bg-blue-950 shadow-sm">
          <img src={caseyImage} alt="Casey" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-blue-950">
            Casey
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" title="Disponible" aria-label="Disponible" />
          </h2>
          <p className="text-xs font-medium text-slate">Asistente CaseBank</p>
          <p className="mt-1 text-xs leading-relaxed text-slate">Pregúntame sobre cualquier contenido del manual.</p>
        </div>
        <div className="group relative shrink-0">
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Colapsar chat"
            className="grid h-9 w-9 place-items-center rounded-lg text-xl text-slate transition hover:bg-brand-blue/5 hover:text-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
          >
            »
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded-md bg-blue-950 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Colapsar chat
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex scroll-mt-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user' ? 'bg-brand-blue text-white' : 'bg-gradient-to-br from-slate-50 to-blue-50 text-blue-950'
              }`}
            >
              <p className="whitespace-pre-line break-words">{renderTextoConNegritas(message.text)}</p>

              {message.fuentes && message.fuentes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-line/60 text-xs space-y-0.5">
                  {message.fuentes.map((f, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSelectSource?.(f.seccion_id)}
                      className="block text-left text-brand-blue hover:underline cursor-pointer"
                    >
                      {f.titulo} (pág. {formatearRangoPaginas(f)})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {messages.length === 1 && !loading && (
          <section className="pt-2">
            <h3 className="mb-2.5 px-1 text-sm font-bold text-brand-blue">Preguntas sugeridas</h3>
            <div className="space-y-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question.text}
                  type="button"
                  onClick={() => sendMessage(question.text)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-brand-blue/30 hover:bg-blue-50/40 hover:shadow-md"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                      question.color === 'emerald'
                        ? 'bg-emerald-50 text-emerald-500'
                        : question.color === 'amber'
                          ? 'bg-amber-50 text-amber-500'
                          : 'bg-blue-50 text-brand-blue'
                    }`}
                  >
                    <SuggestedIcon icon={question.icon} />
                  </span>
                  <span className="flex-1 text-sm font-medium leading-snug text-blue-950">{question.text}</span>
                  <span className="text-xl text-slate transition-transform group-hover:translate-x-0.5" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm bg-paper text-slate">Pensando...</div>
        )}

        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      <form onSubmit={handleSend} className="border-t border-line p-3">
        <div className="relative rounded-xl border border-blue-200 bg-white shadow-sm transition focus-within:border-brand-blue focus-within:ring-[3px] focus-within:ring-brand-blue/15">
        <textarea
          rows="1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage(draft)
            }
          }}
          placeholder="Pregúntale a Casey..."
          disabled={loading}
          className="block h-12 w-full resize-none rounded-xl bg-transparent py-3 pl-3 pr-24 text-sm leading-6 outline-none disabled:opacity-60"
        />
        <div className="group absolute bottom-1.5 right-12">
          <button
            type="submit"
            disabled={loading}
            aria-label="Enviar mensaje"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan text-white shadow-sm transition hover:brightness-105 hover:shadow-md focus:outline-none focus:ring-[3px] focus:ring-brand-blue/20 disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m22 2-7 20-4-9-9-4 20-7Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-blue-950 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Enviar mensaje
          </span>
        </div>
        <div className="group absolute bottom-1.5 right-1.5">
          <button
            type="button"
            onClick={handleClear}
            aria-label="Limpiar chat"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate transition-colors hover:bg-brand-blue/5 hover:text-brand-blue focus:outline-none focus:ring-[3px] focus:ring-brand-blue/15"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="m19 6-1 14H6L5 6" />
              <path d="M10 11v5M14 11v5" />
            </svg>
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 whitespace-nowrap rounded-md bg-blue-950 px-2 py-1 text-xs text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Limpiar chat
          </span>
        </div>
        </div>
      </form>
    </aside>
  )
}