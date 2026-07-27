import { useState } from 'react'

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    role: 'assistant',
    text:
      'Hola, soy el asistente de CaseBank. Todavía no estoy conectado al contenido del manual — por ahora esto es solo la base visual del chat.',
  },
]

export default function ChatPanel() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [draft, setDraft] = useState('')

  function handleSend(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return

    const userMessage = { id: `u-${Date.now()}`, role: 'user', text }
    const mockReply = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      text: 'Esto es una respuesta de ejemplo. Cuando se conecte el RAG local, responderé según el contenido real del manual.',
    }

    setMessages((prev) => [...prev, userMessage, mockReply])
    setDraft('')
  }

  return (
    <aside className="w-full h-full flex flex-col bg-white">
      <div className="px-4 py-4 border-b border-line">
        <h2 className="font-display text-sm font-semibold text-ink">Asistente CaseBank</h2>
        <p className="text-xs text-slate mt-0.5">Responde según el manual (mock)</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
              message.role === 'user' ? 'ml-auto bg-brand-blue text-white' : 'bg-paper text-ink'
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-line flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe tu pregunta..."
          className="flex-1 min-w-0 px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-brand-blue focus:ring-[3px] focus:ring-brand-blue/15"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan text-white text-sm font-semibold hover:brightness-105 transition"
        >
          Enviar
        </button>
      </form>
    </aside>
  )
}
