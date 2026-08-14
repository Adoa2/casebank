import { useEffect, useState } from 'react'
import caseyDer from '../assets/casey_der.png'
import caseyIzq from '../assets/casey_izq.png'
import caseyCar1 from '../assets/casey_car1.png'
import caseyCar2 from '../assets/casey_car2.png'
import { getUsername } from '../api/authToken'

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

export default function WelcomeCarousel() {
  const [index, setIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const slide = SLIDES[index]
  const username = getUsername()?.trim()

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
      <h1 className="font-display text-xl font-bold text-blue-950 sm:text-3xl">
        ¡Bienvenido a CaseBank{username ? `, ${username}` : ''}!
      </h1>
      <p className="mt-1 text-sm text-slate sm:text-base">
        Consulta el manual o pregúntale a Casey.
      </p>

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
