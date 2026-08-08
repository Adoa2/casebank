import { useEffect, useState } from 'react'

const SLIDE_DURATION_MS = 6000

const SLIDES = [
  {
    title: 'Manejo de Cartera',
    description:
      'Manejo de cuentas de Aportaciones, Ahorros retirables, etc. y fácil parametrización de nuevos productos financieros.',
    image: 'https://picsum.photos/seed/casebank-cartera/900/560',
  },
  {
    title: 'Compatible con líneas de negocio',
    description:
      'Con el sistema ALMA integramos líneas de negocio en las Cooperativas (Comisariatos, Tiendas de conveniencia, entre otros).',
    image: 'https://picsum.photos/seed/casebank-alma/900/560',
  },
  {
    title: 'Conexión con la banca',
    description:
      'Nuestros clientes pueden conectar con los servicios de la banca mediante nuestro software CASEBANK.',
    image: 'https://picsum.photos/seed/casebank-banca/900/560',
  },
  {
    title: 'La solución de tus problemas es nuestra prioridad',
    description:
      'Nuestros sistemas son 100% personalizables, lo que significa que nos adaptamos a tu negocio de una manera fluida y permanente.',
    image: 'https://picsum.photos/seed/casebank-soluciones/900/560',
  },
  {
    title: '¿Por qué elegir CaseBank?',
    bullets: [
      'Diseñado para que los usuarios puedan operar sin necesidad de conocimientos técnicos avanzados.',
      'Automatiza tareas repetitivas, reduce errores humanos y mejora la eficiencia del personal, generando ahorros significativos.',
      'Incluye asistencia especializada y actualizaciones regulares para garantizar mejoras continuas y seguridad de la información.',
      'Garantiza el cumplimiento de normativas contables y regulatorias con auditorías automáticas y encriptación de datos.',
    ],
    image: 'https://picsum.photos/seed/casebank-beneficios/900/560',
  },
]

export default function WelcomeCarousel() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % SLIDES.length)
    }, SLIDE_DURATION_MS)

    return () => clearInterval(timer)
  }, [paused])

  const slide = SLIDES[index]

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-1">Manual interactivo de CaseBank</h1>
      <p className="text-slate leading-relaxed mb-6">
        Selecciona un capítulo del índice a la izquierda para ver su contenido.
      </p>

      <div
        className="relative border border-line rounded-xl overflow-hidden bg-white"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <img src={slide.image} alt={slide.title} className="w-full h-48 object-cover" />

        <div className="p-5 min-h-[9.5rem]">
          <h2 className="font-display text-base font-semibold mb-2">{slide.title}</h2>

          {slide.description && <p className="text-sm text-slate leading-relaxed">{slide.description}</p>}

          {slide.bullets && (
            <ul className="text-sm text-slate leading-relaxed list-disc pl-5 space-y-1">
              {slide.bullets.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 pb-4">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ir a la diapositiva ${i + 1}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                i === index ? 'w-5 bg-brand-blue' : 'w-1.5 bg-line'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 border border-line rounded-xl p-5 bg-paper">
        <p className="text-sm text-slate leading-relaxed">
          Sistema diseñado específicamente para las necesidades del sector financiero y cooperativista, con más de
          30 años de existir, asegurando cumplimiento con regulaciones y mejores prácticas.
        </p>
      </div>
    </div>
  )
}