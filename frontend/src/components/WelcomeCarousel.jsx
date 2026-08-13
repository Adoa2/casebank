import { useEffect, useState } from 'react'
import caseyDer from '../assets/casey_der.png'
import caseyIzq from '../assets/casey_izq.png'
import caseyCar1 from '../assets/casey_car1.png'
import caseyCar2 from '../assets/casey_car2.png'

const SLIDES = [
  {
    image: caseyDer,
    alt: 'Casey presenta la inteligencia artificial disponible en el panel derecho',
    duration: 6000,
  },
  {
    image: caseyIzq,
    alt: 'Casey presenta el manual completo disponible en el panel izquierdo',
    duration: 6000,
  },
  {
    image: caseyCar1,
    alt: 'Casey explica cómo encontrar respuestas rápidamente en el manual',
    duration: 6000,
  },
  {
    image: caseyCar2,
    alt: 'Casey explica cómo solicitar soporte cuando aparece un error en el sistema',
    duration: 6000,
  },
]

const STEPS = [
  {
    title: 'Busca en el manual',
    description: 'Encuentra lo que necesitas fácilmente.',
    icon: 'search',
  },
  {
    title: 'Consulta el contenido',
    description: 'Explora capítulos y procedimientos.',
    icon: 'book',
  },
  {
    title: 'Pregúntale a Casey',
    description: 'Obtén ayuda rápida y precisa.',
    icon: 'chat',
  },
]

function StepIcon({ icon }) {
  if (icon === 'search') {
    return (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" />
      </svg>
    )
  }

  if (icon === 'book') {
    return (
      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" />
      </svg>
    )
  }

  return (
    <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="5" />
      <path d="M8 11h.01M16 11h.01M9 15h6M12 2v3" />
    </svg>
  )
}

export default function WelcomeCarousel() {
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const slide = SLIDES[index]

  useEffect(() => {
    if (isPaused) return undefined

    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % SLIDES.length)
    }, slide.duration)

    return () => window.clearTimeout(timer)
  }, [index, isPaused, slide.duration])

  function move(direction) {
    setIndex((current) => (current + direction + SLIDES.length) % SLIDES.length)
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="font-display text-xl font-bold text-blue-950 sm:text-3xl">¡Bienvenido a CaseBank!</h1>
      <p className="mt-1 text-sm text-slate sm:text-base">
        Consulta el manual o pregúntale a Casey.
      </p>

      <section className="mt-4 grid overflow-hidden rounded-2xl border border-blue-100 bg-white px-3 py-3 shadow-sm sm:grid-cols-3 sm:px-4">
        {STEPS.map((step, stepIndex) => (
          <div
            key={step.title}
            className="relative flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-1 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-blue-100 sm:[&:not(:last-child)]:border-b-0 sm:[&:not(:last-child)]:border-r"
          >
            <span className="absolute left-3 top-1 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-sky-cyan to-brand-blue text-xs font-bold text-white shadow-sm sm:left-4 sm:-top-1">
              {stepIndex + 1}
            </span>
            <span className="mt-3 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-cyan to-blue-700 text-white shadow-md">
              <StepIcon icon={step.icon} />
            </span>
            <div className="min-w-0 flex-1 pt-2">
              <h2 className="text-sm font-bold leading-snug text-blue-950">{step.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate">{step.description}</p>
            </div>
            {stepIndex < STEPS.length - 1 && (
              <span className="hidden text-3xl font-light text-brand-blue sm:block" aria-hidden="true">›</span>
            )}
          </div>
        ))}
      </section>

      <section
        className="relative mx-auto mt-4 max-w-[720px] overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 shadow-sm"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Diapositiva anterior"
          className="absolute left-2 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-2xl text-brand-blue shadow-md transition hover:scale-105 sm:left-3 sm:h-10 sm:w-10"
        >
          ‹
        </button>

        <img src={slide.image} alt={slide.alt} className="aspect-[3/2] w-full object-cover" />

        <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-full bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur-sm sm:bottom-4 sm:py-2">
          {SLIDES.map((_, dotIndex) => (
            <button
              key={dotIndex}
              type="button"
              onClick={() => setIndex(dotIndex)}
              aria-label={`Ir a la diapositiva ${dotIndex + 1}`}
              className={`h-2 rounded-full transition-all ${
                dotIndex === index ? 'w-5 bg-brand-blue' : 'w-2 bg-slate/40'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Siguiente diapositiva"
          className="absolute right-2 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-2xl text-brand-blue shadow-md transition hover:scale-105 sm:right-3 sm:h-10 sm:w-10"
        >
          ›
        </button>
      </section>
      <p className="mx-auto mt-1.5 max-w-[720px] text-center text-xs text-slate">
        Mantén el cursor sobre la imagen para pausar el carrusel y leerla con calma.
      </p>
    </div>
  )
}
