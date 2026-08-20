import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders, parseApiResponse } from '../api/authToken'
import caseyImage from '../assets/casey_perfil.png'
import ImageLightbox from './ImageLightbox'

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
  const [activeConfirmation, setActiveConfirmation] = useState(null)
  const [activeDiagnostico, setActiveDiagnostico] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const messagesEndRef = useRef(null)
  const selectedClarificationsRef = useRef(new Set())

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })

    return () => cancelAnimationFrame(frame)
  }, [messages, loading, activeConfirmation, activeDiagnostico])

  function handleClear() {
    setMessages([...INITIAL_MESSAGES])
    setActiveConfirmation(null)
    setActiveDiagnostico(null)
    selectedClarificationsRef.current.clear()
  }

  async function sendMessage(value, opts = {}) {
    const {
      contextoError = null,
      confirmacion = null,
      contextoDiagnostico = null,
      opcionDiagnosticoId = null,
      displayText = null,
    } = opts
    const text = (displayText ?? value).trim()
    if (!text || loading) return

    if (!contextoError && !contextoDiagnostico && text.length < 3) {
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
    setActiveConfirmation(null)
    setActiveDiagnostico(null)
    setLoading(true)

    try {
      const historial = messages
        .filter((message) => message.id !== 'welcome' && !message.id.startsWith('e-'))
        .slice(-8)
        .map((message) => ({ role: message.role, text: message.text.slice(0, 1200) }))
      const body = { pregunta: (value ?? text).trim(), historial }
      if (contextoError) body.contexto_error = contextoError
      if (confirmacion !== null) body.confirmacion = confirmacion
      if (contextoDiagnostico) body.contexto_diagnostico = contextoDiagnostico
      if (opcionDiagnosticoId !== null) body.opcion_diagnostico_id = opcionDiagnosticoId

      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })

      const data = await parseApiResponse(res)
      const assistantMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.respuesta,
        fuentes: data.fuentes || [],
        imagenEvidencia: data.imagen_evidencia || null,
        opcionesAclaracion: data.opciones_aclaracion || [],
        sugerirSoporte: Boolean(data.sugerir_soporte),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setActiveConfirmation(data.pendiente_confirmacion || null)
      setActiveDiagnostico(data.pendiente_diagnostico || null)
    } catch (err) {
      const errorMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        text: err.message || 'Ocurrió un error al consultar el asistente.',
        fuentes: [],
      }
      setMessages((prev) => [...prev, errorMessage])
      setActiveConfirmation(null)
      setActiveDiagnostico(null)
    } finally {
      setLoading(false)
    }
  }

  function handleSend(e) {
    e.preventDefault()
    sendMessage(draft)
  }

  function handleConfirmacion(esCorrecto) {
    if (!activeConfirmation || loading) return
    const texto = esCorrecto ? 'Sí, es mi error' : 'No, no es mi error'
    sendMessage(texto, {
      contextoError: activeConfirmation,
      confirmacion: esCorrecto,
      displayText: texto,
    })
  }

  function handleDiagnosticoChoice(opcion) {
    if (!activeDiagnostico || loading) return
    sendMessage(opcion.pregunta, {
      contextoDiagnostico: {
        error_id: activeDiagnostico.error_id,
        pregunta_original: activeDiagnostico.pregunta_original,
      },
      opcionDiagnosticoId: opcion.id,
      displayText: opcion.pregunta,
    })
  }

  function handleClarificationChoice(messageId, opcion) {
    if (loading || selectedClarificationsRef.current.has(messageId)) return
    selectedClarificationsRef.current.add(messageId)
    setMessages((prev) => prev.map((message) => (
      message.id === messageId
        ? { ...message, opcionAclaracionSeleccionada: opcion }
        : message
    )))
    sendMessage(opcion)
  }

  const inputDisabled = loading || !!activeConfirmation || !!activeDiagnostico

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

              {message.opcionesAclaracion?.length > 0 && (
                <div className="mt-3 flex flex-col gap-2" aria-label="Opciones para aclarar la pregunta">
                  {message.opcionesAclaracion.map((opcion, index) => (
                    <button
                      key={opcion}
                      type="button"
                      onClick={() => handleClarificationChoice(message.id, opcion)}
                      disabled={loading || Boolean(message.opcionAclaracionSeleccionada)}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed ${
                        message.opcionAclaracionSeleccionada === opcion
                          ? 'border-brand-blue bg-blue-100 text-blue-950 ring-1 ring-brand-blue/20'
                          : message.opcionAclaracionSeleccionada
                            ? 'border-slate-200 bg-slate-50 text-slate-400 opacity-60'
                            : 'border-blue-200 bg-white text-blue-950 hover:border-brand-blue hover:bg-blue-50 disabled:opacity-60'
                      }`}
                    >
                      <span className={`mr-1.5 font-bold ${message.opcionAclaracionSeleccionada && message.opcionAclaracionSeleccionada !== opcion ? 'text-slate-400' : 'text-brand-blue'}`}>{index + 1}.</span>
                      {opcion}
                      {message.opcionAclaracionSeleccionada === opcion && <span className="ml-1.5 text-brand-blue">✓</span>}
                    </button>
                  ))}
                </div>
              )}

              {message.sugerirSoporte && (
                <a
                  href="https://soporte.sinteghn.com/clientes/login.php"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-105"
                >
                  Crear ticket en Soporte
                </a>
              )}

              {message.imagenEvidencia && (
                <button
                  type="button"
                  onClick={() => setLightboxUrl(message.imagenEvidencia)}
                  className="mt-2.5 block cursor-zoom-in"
                  aria-label="Ampliar imagen de evidencia"
                >
                  <img
                    src={message.imagenEvidencia}
                    alt="Evidencia del error"
                    className="max-h-56 rounded-lg border border-line/60 object-contain transition hover:opacity-90"
                  />
                  <span className="mt-1 block text-xs text-brand-blue">Toca para ampliar</span>
                </button>
              )}

              {message.fuentes && message.fuentes.length > 0 && (
                <div className="mt-2 pt-2 border-t border-line/60 text-xs space-y-0.5">
                  {message.fuentes.map((f, idx) => f.url ? (
                    <a key={idx} href={f.url} target="_blank" rel="noopener noreferrer" className="block text-left text-brand-blue hover:underline">
                      {f.titulo} · Actualización PDF{f.pagina ? ` (pág. ${formatearRangoPaginas(f)})` : ''}
                    </a>
                  ) : (
                    <button key={idx} type="button" onClick={() => onSelectSource?.(f.seccion_id)} className="block cursor-pointer text-left text-brand-blue hover:underline">
                      {f.titulo} (pág. {formatearRangoPaginas(f)})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {activeConfirmation && !loading && (
          <div className="flex justify-start">
            <div className="flex gap-2 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-3">
              <button
                type="button"
                onClick={() => handleConfirmacion(true)}
                className="rounded-lg bg-gradient-to-r from-brand-blue to-sky-cyan px-4 py-2 text-sm font-semibold text-white hover:brightness-105"
              >
                Sí, es mi error
              </button>
              <button
                type="button"
                onClick={() => handleConfirmacion(false)}
                className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                No es mi error
              </button>
            </div>
          </div>
        )}

        {activeDiagnostico && !loading && (
          <div className="flex justify-start">
            <div className="flex max-w-[88%] flex-col gap-2 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-3">
              {activeDiagnostico.opciones.map((opcion) => (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => handleDiagnosticoChoice(opcion)}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-xs font-medium text-blue-950 transition hover:border-brand-blue hover:bg-blue-50"
                >
                  {opcion.pregunta}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length === 1 && !loading && !activeConfirmation && !activeDiagnostico && (
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
        {(activeConfirmation || activeDiagnostico) && (
          <p className="mb-2 px-1 text-xs text-slate-400">
            Responde con los botones de arriba para continuar.
          </p>
        )}
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
          disabled={inputDisabled}
          className="block h-12 w-full resize-none rounded-xl bg-transparent py-3 pl-3 pr-24 text-sm leading-6 outline-none disabled:opacity-60"
        />
        <div className="group absolute bottom-1.5 right-12">
          <button
            type="submit"
            disabled={inputDisabled}
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

      {lightboxUrl && (
        <ImageLightbox imageUrl={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </aside>
  )
}