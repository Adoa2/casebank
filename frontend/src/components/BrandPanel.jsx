import caseyImage from '../assets/casey_saludo.png'
import logoImage from '../assets/logo.png'

const features = [
  {
    title: 'Explorar el manual',
    description: 'Consulta capítulos, secciones y procedimientos paso a paso.',
    color: 'bg-blue-600',
    icon: (
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v16H7.5A3.5 3.5 0 0 0 4 21.5v-16Zm16 0A3.5 3.5 0 0 0 16.5 2H13v16h3.5a3.5 3.5 0 0 1 3.5 3.5v-16Z" />
    ),
  },
  {
    title: 'Hacer consultas',
    description: 'Pregúntame lo que necesites y te responderé al instante.',
    color: 'bg-sky-500',
    icon: (
      <path d="M5 4h14a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-8l-5 4v-4H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm3 6a1.25 1.25 0 1 0 0 .01V10Zm4 0a1.25 1.25 0 1 0 0 .01V10Zm4 0a1.25 1.25 0 1 0 0 .01V10Z" />
    ),
  },
  {
    title: 'Conocer más de CASEBANK',
    description: 'Descubre funcionalidades, buenas prácticas y recomendaciones.',
    color: 'bg-emerald-500',
    icon: (
      <path d="M4 19h4v-7H4v7Zm6 0h4V5h-4v14Zm6 0h4V9h-4v10Z" />
    ),
  },
]

export default function BrandPanel() {
  return (
    <section className="brand-gradient brand-dots relative flex min-h-screen flex-col overflow-hidden px-6 py-5 text-white sm:px-8 lg:px-10">
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-64 w-80 bg-white/5"
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        aria-hidden="true"
      />

      <header className="relative z-10">
        <img
          src={logoImage}
          alt="CaseBank"
          className="h-auto w-full object-contain object-left"
          style={{ maxWidth: '150px' }}
        />
      </header>

      <div className="brand-hero relative z-10 mt-4 flex flex-1 flex-col gap-4 sm:gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <h1 className="font-display text-[clamp(2.1rem,3.6vw,2.8rem)] font-semibold leading-tight">
            Tu manual
            <br />
            interactivo de
            <br />
            <span className="text-cyan-300">CASEBANK</span>
          </h1>

          <p className="mt-4 max-w-[38ch] text-base leading-relaxed text-white/95 sm:text-lg">
            Consulta cualquier procedimiento del sistema y pregunta a la IA tus casos específicos.
          </p>

          <div className="mt-5 space-y-2 text-sm sm:text-base">
            <p className="flex items-center gap-3">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400 text-xs font-bold text-blue-800">✓</span>
              Busca por capítulo, sección o palabra clave
            </p>
            <p className="flex items-center gap-3">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400 text-xs font-bold text-blue-800">✓</span>
              Pregunta directamente al asistente si tienes dudas
            </p>
          </div>
        </div>

        <div className="flex w-full justify-center md:w-auto md:flex-1 md:justify-end">
          <img
            src={caseyImage}
            alt="Casey"
            className="h-auto w-full max-w-[260px] sm:max-w-[300px] md:max-w-[360px] lg:max-w-[420px] drop-shadow-[0_24px_40px_rgba(0,0,0,0.28)]"
          />
        </div>
      </div>

      <div className="relative z-20 mt-2 grid gap-3 md:grid-cols-3">
        {features.map((feature) => (
          <article key={feature.title} className="rounded-2xl bg-white/75 p-3 text-blue-950 shadow-lg backdrop-blur-sm">
            <div className={`grid h-10 w-10 place-items-center rounded-full text-white ${feature.color}`}>
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                {feature.icon}
              </svg>
            </div>
            <h2 className="mt-2 text-sm font-bold">{feature.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-blue-950/80">{feature.description}</p>
          </article>
        ))}
      </div>

      <div className="relative z-20 mt-3 flex flex-col items-start gap-3 rounded-2xl bg-white/75 px-4 py-3 text-blue-950 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-yellow-100 text-xl" aria-hidden="true">💡</div>
        <p className="text-sm font-semibold leading-relaxed">
          Diseñado para hacer tu trabajo más fácil, rápido y confiable.
          <strong className="block text-blue-800">¡Estoy aquí para acompañarte!</strong>
        </p>
      </div>
    </section>
  )
}
