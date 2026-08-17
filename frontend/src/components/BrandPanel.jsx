import { useEffect, useState } from 'react'
import caseyImage from '../assets/casey_saludo.png'
import logoImage from '../assets/logo_black.png'

const profileAssets = import.meta.glob('../assets/perfil*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const team = [
  { image: 'perfil_1', name: 'Ing. José Alfredo Martínez', role: 'Gerente Evaluate Comercial' },
  { image: 'perfil_2', name: 'MSc. José Alfredo Martínez Cáceres', role: 'Gerente SINTEG' },
  { image: 'perfil_3', name: 'MSc. Jairon Aviles', role: 'Jefe de Desarrollo' },
  { image: 'perfil_4', name: 'MSc. Esdra Alvarez', role: 'Programadora' },
  { image: 'perfil_9', name: 'Ing. Tania Coca', role: 'Soporte técnico' },
  { image: 'perfil_5', name: 'MSc. Gimena Sanchez', role: 'Programadora' },
  { image: 'perfil_6', name: 'Ing. Hesler Alvarado', role: 'Programador' },
  { image: 'perfil_7', name: 'MSc. Heidy Lemus', role: 'Programadora' },
  { image: 'perfil_8', name: 'Ing. Adolfo Amador', role: 'Programador' },
]

function findProfile(name) {
  const entry = Object.entries(profileAssets).find(([path]) => path.match(new RegExp(`/${name}\\.(png|jpg|webp)$`, 'i')))
  return entry?.[1]
}

export default function BrandPanel() {
  const [carouselSlide, setCarouselSlide] = useState(0)
  const teamPages = Math.ceil(team.length / 5)
  const totalSlides = teamPages + 1
  const visibleTeam = carouselSlide > 0 ? team.slice((carouselSlide - 1) * 5, carouselSlide * 5) : []

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCarouselSlide((current) => (current + 1) % totalSlides)
    }, 10000)

    return () => window.clearInterval(interval)
  }, [totalSlides])

  function moveCarousel(direction) {
    setCarouselSlide((current) => (current + direction + totalSlides) % totalSlides)
  }

  return (
    <section className="brand-light relative flex min-h-screen flex-col overflow-hidden px-[clamp(2rem,4vw,3.75rem)] py-[clamp(1.5rem,3vh,2.6rem)] text-[#102451]">
      <div className="brand-corner-dots" aria-hidden="true" />

      <header className="relative z-10">
        <img src={logoImage} alt="CaseBank" className="h-auto w-[150px] object-contain object-left" />
      </header>

      <div className="relative z-10 mt-[clamp(1.6rem,4vh,3.25rem)] grid grid-cols-[minmax(220px,.9fr)_minmax(240px,1.1fr)] items-stretch gap-5">
        <div className="flex h-full flex-col">
          <div className="inline-flex items-center gap-2 rounded-xl bg-blue-100/80 px-4 py-2 text-sm font-semibold text-blue-700">
            <span className="text-lg text-blue-500">✣</span> Tu guía inteligente
          </div>
          <h1 className="mt-5 font-display text-[clamp(2.15rem,3.25vw,3.2rem)] font-bold leading-[1.03] tracking-[-0.035em]">
            Tu manual<br />interactivo de<br /><span className="brand-title-gradient">CASEBANK</span>
          </h1>
          <p className="mt-5 max-w-[39ch] text-[0.92rem] leading-relaxed text-[#536589]">
            Consulta cualquier procedimiento del sistema y pregunta a la IA tus casos específicos.
          </p>
          <div className="mt-5 space-y-2.5 text-[0.82rem] text-[#455a80]">
            {['Busca por capítulo, sección o palabra clave', 'Pregunta directamente al asistente si tienes dudas'].map((text) => (
              <p key={text} className="flex items-center gap-3">
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#18b9a7] text-[11px] font-bold text-white">✓</span>{text}
              </p>
            ))}
          </div>

        </div>

        <div className="relative flex min-h-[330px] items-center justify-center">
          <div className="absolute top-0 h-[min(28vw,370px)] w-[min(28vw,370px)] rounded-full bg-gradient-to-br from-blue-100/70 to-cyan-50/30" aria-hidden="true" />
          <img src={caseyImage} alt="Casey, asistente virtual de CaseBank" className="relative z-10 w-full max-w-[410px] drop-shadow-[0_22px_28px_rgba(42,93,180,0.18)]" />
        </div>
      </div>

      <section className="team-showcase relative z-20 mt-4 w-full">
        <button type="button" onClick={() => moveCarousel(-1)} className="team-arrow left-3" aria-label="Diapositiva anterior">‹</button>
        <div className="carousel-content px-12" key={carouselSlide}>
          {carouselSlide === 0 ? (
            <div className="casey-carousel-intro">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white" aria-hidden="true">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3a7 7 0 0 0-4.7 12.2L7 20l4.2-2.1c.3.1.5.1.8.1a7 7 0 1 0 0-14Z" /><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" strokeLinecap="round" /></svg>
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-[#0c3f91]">¿Quién es Casey?</h2>
                <p className="mt-1.5 text-[0.8rem] leading-relaxed text-[#60708f]">Casey es el asistente virtual de CaseBank. Brinda orientación basada en el manual del sistema, ayuda a comprender algunos mensajes de error y explica distintos procedimientos de manera clara, práctica y confiable.</p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-[#102451]">
                <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 19v-1a5 5 0 0 1 10 0v1M16 6a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5" /></svg>
                Conoce a nuestro equipo técnico
              </h2>
              <div className={`grid gap-3 ${visibleTeam.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
                {visibleTeam.map((person) => {
                  const src = findProfile(person.image)
                  const initials = person.name.replace(/^(Ing\.|MSc\.)\s*/, '').split(' ').slice(0, 2).map((part) => part[0]).join('')
                  return (
                    <article key={person.image} className="min-w-0 text-center">
                      <div className="team-photo mx-auto">{src ? <img src={src} alt={person.name} /> : <span aria-label={`Imagen pendiente de ${person.name}`}>{initials}</span>}</div>
                      <h3 className="mt-2 text-[0.66rem] font-bold leading-tight text-[#102451]">{person.name}</h3>
                      <p className="mt-1 text-[0.55rem] uppercase leading-tight tracking-wide text-[#7786a3]">{person.role}</p>
                    </article>
                  )
                })}
              </div>
            </>
          )}
          </div>
        <button type="button" onClick={() => moveCarousel(1)} className="team-arrow right-3" aria-label="Siguiente diapositiva">›</button>
        <div className="mt-3 flex justify-center gap-2" aria-label="Diapositivas informativas">
          {Array.from({ length: totalSlides }, (_, index) => (
            <button key={index} type="button" onClick={() => setCarouselSlide(index)} className={`h-2 rounded-full transition-all ${index === carouselSlide ? 'w-6 bg-blue-600' : 'w-2 bg-blue-200'}`} aria-label={`Ver diapositiva ${index + 1}`} aria-current={index === carouselSlide ? 'true' : undefined} />
          ))}
        </div>
      </section>
    </section>
  )
}
