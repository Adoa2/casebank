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

export default function ChatPanel() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)

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
      <div className="px-4 py-4 border-b border-line">
        <h2 className="font-display text-sm font-semibold text-ink">Asistente CaseBank</h2>
        <p className="text-xs text-slate mt-0.5">Responde según el contenido real del manual</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
              message.role === 'user' ? 'ml-auto bg-brand-blue text-white' : 'bg-paper text-ink'
            }`}
          >
            <p className="whitespace-pre-line">{message.text}</p>

            {message.fuentes && message.fuentes.length > 0 && (
              <div className="mt-2 pt-2 border-t border-line/60 text-xs text-slate space-y-0.5">
                {message.fuentes.map((f, idx) => (
                  <p key={idx}>
                    {f.titulo} (pág. {f.pagina})
                  </p>
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
          className="flex-1 min-w-0 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-brand-blue focus:ring-[3px] focus:ring-brand-blue/15 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan text-white text-sm font-semibold hover:brightness-105 transition disabled:opacity-60"
        >
          Enviar
        </button>
      </form>
    </aside>
  )
}