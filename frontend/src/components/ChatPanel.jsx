import { useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Hola, soy el asistente de CaseBank. Pregúntame cualquier duda sobre el uso del sistema.',
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
      <div className="px-4 py-4 border-b border-line flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-semibold text-ink">Asistente CaseBank</h2>
          <p className="text-xs text-slate mt-0.5">Responde según el contenido real del manual</p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-slate border border-line rounded-md px-2.5 py-1.5 transition-colors cursor-pointer flex-shrink-0 hover:text-brand-teal-600 hover:border-brand-teal-200 hover:bg-brand-teal-50"
        >
          Limpiar chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
              message.role === 'user' ? 'ml-auto bg-brand-blue text-white' : 'bg-paper text-ink'
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
        ))}

        {loading && (
          <div className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm bg-paper text-slate">Pensando...</div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-line flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe tu pregunta..."
          disabled={loading}
          className="flex-1 min-w-0 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-brand-teal-400 focus:ring-[3px] focus:ring-brand-teal-400/15 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-teal-600 to-brand-teal-500 text-white text-sm font-semibold shadow-sm hover:from-brand-teal-700 hover:to-brand-teal-600 hover:shadow-md transition disabled:opacity-60"
        >
          Enviar
        </button>
      </form>
    </aside>
  )
}