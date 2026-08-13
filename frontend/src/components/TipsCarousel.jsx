import { useEffect, useState } from 'react'

const TIPS = [
  'Antes de registrar un nuevo cooperativista, verifica que la persona esté registrada en el Censo Nacional.',
  'Realiza los posteos de intereses puntualmente al final de cada mes.',
  'Para que un socio aparezca en las planillas patronales, debes asignarle un patrono en su perfil.',
  'Para que una deducción aparezca en las planillas patronales, selecciona la opción “Cobro por planilla”.',
  'Antes de desembolsar un préstamo, asegúrate de que se encuentre en estado “Aprobado”.',
  'Las planillas patronales solo pueden ser anuladas mientras estén en estado GENERADO',
  'Imprima el pagaré inmediatamente después del desembolso. Si lo imprime posteriormente, es posible que los datos hayan cambiado debido a movimientos realizados en la cuenta.'
]

const TIP_DURATION = 7000

export default function TipsCarousel() {
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused) return undefined

    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % TIPS.length)
    }, TIP_DURATION)

    return () => window.clearTimeout(timer)
  }, [index, isPaused])

  function move(direction) {
    setIndex((current) => (current + direction + TIPS.length) % TIPS.length)
  }

  return (
    <footer
      className="flex min-h-[54px] shrink-0 items-center gap-2 border-t border-blue-100 bg-blue-50/90 px-3 py-2 text-xs text-slate sm:gap-3 sm:px-6 sm:text-sm"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Consejos útiles de CaseBank"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-100 text-brand-blue" aria-hidden="true">💡</span>
      <strong className="hidden shrink-0 text-brand-blue sm:block">Consejo útil</strong>
      <span className="min-w-0 flex-1 leading-snug" aria-live="polite">{TIPS[index]}</span>
      <span className="shrink-0 text-xs font-medium text-slate">{index + 1} / {TIPS.length}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Consejo anterior"
          title="Consejo anterior"
          className="grid h-8 w-8 place-items-center rounded-lg text-xl text-brand-blue transition hover:bg-blue-100"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Siguiente consejo"
          title="Siguiente consejo"
          className="grid h-8 w-8 place-items-center rounded-lg text-xl text-brand-blue transition hover:bg-blue-100"
        >
          ›
        </button>
      </div>
    </footer>
  )
}
