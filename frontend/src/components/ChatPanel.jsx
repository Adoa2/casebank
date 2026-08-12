import { useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'
import caseyImage from '../assets/casey.png'

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '¡Hola! Soy Casey, tu asistente virtual de CaseBank. Pregúntame cualquier duda sobre el uso del sistema y con gusto te ayudaré.',
    fuentes: [],
  },
]

function renderTextoConNegritas(texto) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g)
  return partes.map((parte, idx) => {
    if (parte.startsWith('**') && parte.endsWith('**')) {
      return <strong key={idx}>{parte.slice(2, -2)}</strong>
    }
    return <span key={idx}>{parte}</span>
  })
}

export default function ChatPanel({ onSelectSource }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)

  function handleClear() {
    setMessages([...INITIAL_MESSAGES])
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || loading) return

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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'No se pudo obtener respuesta del asistente.')
      }

      const data = await res.json()
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

  return (
    <aside className="w-full h-full flex flex-col bg-white">
      <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-blue-950">
            <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden="true" />
            Asistente CaseBank
          </h2>
          <p className="text-xs text-slate mt-0.5">Responde según el contenido real del manual</p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-slate border border-line rounded-md px-2.5 py-1.5 transition-colors cursor-pointer flex-shrink-0 hover:text-brand-blue hover:border-brand-blue/30 hover:bg-brand-blue/5"
        >
          Limpiar chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
            {message.role === 'assistant' && (
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-blue-100 bg-blue-950">
                <img src={caseyImage} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user' ? 'bg-brand-blue text-white' : 'bg-paper text-ink'
              }`}
            >
              <p className="whitespace-pre-line">{renderTextoConNegritas(message.text)}</p>

              {message.fuentes && message.fuentes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-line/60 text-xs space-y-0.5">
                  {message.fuentes.map((f, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSelectSource?.(f.seccion_id)}
                      className="block text-left text-brand-blue hover:underline cursor-pointer"
                    >
                      {f.titulo} (pág. {f.pagina})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm bg-paper text-slate">Pensando...</div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-line flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe tu pregunta..."
          disabled={loading}
          className="flex-1 min-w-0 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-brand-blue focus:ring-[3px] focus:ring-brand-blue/15 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan text-white text-sm font-semibold shadow-sm hover:brightness-105 hover:shadow-md transition disabled:opacity-60"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m22 2-7 20-4-9-9-4 20-7Z" />
            <path d="M22 2 11 13" />
          </svg>
          Enviar
        </button>
      </form>
    </aside>
  )
}