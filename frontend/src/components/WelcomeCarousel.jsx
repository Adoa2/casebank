import { useEffect, useState } from 'react'

const SLIDE_DURATION_MS = 4000

const SLIDES = [
  {
    title: 'Manejo de Cartera',
    description:
      'Manejo de cuentas de Aportaciones, Ahorros retirables, etc. y fácil parametrización de nuevos productos financieros.',
    image: 'https://coopvinci.com/wp-content/uploads/2019/06/aportaciones-coopvinci.png',
  },
  {
    title: 'Conexión con la banca',
    description:
      'Nuestros clientes pueden conectar con los servicios de la banca mediante nuestro software CASEBANK.',
    image: 'https://media.istockphoto.com/id/962095876/es/foto/hombre-usando-banca-en-l%C3%ADnea-con-tarjeta-de-cr%C3%A9dito-en-el-dispositivo-de-pantalla-t%C3%A1ctil-banca.jpg?s=612x612&w=0&k=20&c=9Ec7VNswKfgl9Kpyw4_0GqBS9roLEhFz_RiFvrq7KsE=',
  },
  {
    title: 'La solución de tus problemas es nuestra prioridad',
    description:
      'Nuestros sistemas son 100% personalizables, lo que significa que nos adaptamos a tu negocio de una manera fluida y permanente.',
    image: 'https://www.holded.com/_next/image?url=%2Fimages%2Fblog%2Ferp-para-contabilidad.jpeg&w=1920&q=75&dpl=dpl_3DiuAxxubguXgZmaRbBza42NE9io',
  },
  {
    title: '¿Por qué elegir CaseBank?',
    bullets: [
      'Diseñado para que los usuarios puedan operar sin necesidad de conocimientos técnicos avanzados.',
      'Automatiza tareas repetitivas, reduce errores humanos y mejora la eficiencia del personal, generando ahorros significativos.',
      'Incluye asistencia especializada y actualizaciones regulares para garantizar mejoras continuas y seguridad de la información.',
      'Garantiza el cumplimiento de normativas contables y regulatorias con auditorías automáticas y encriptación de datos.',
    ],
    image: 'https://img.magnific.com/foto-gratis/hombre-expresivo-barba-camisa_273609-5928.jpg?semt=ais_test_b&w=740&q=80',
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