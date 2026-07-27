export default function BrandPanel() {
  return (
    <div className="relative brand-gradient brand-dots text-white flex flex-col justify-center overflow-hidden px-8 py-14 md:px-20">
      <svg
        className="animate-spark absolute top-[14%] right-[12%] w-11 h-11"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="24" y2="24">
            <stop offset="0%" stopColor="#FFD54A" />
            <stop offset="100%" stopColor="#FF8A00" />
          </linearGradient>
        </defs>
        <path
          d="M12 2 C12.6 7.8 15.2 10.4 21 11 C15.2 11.6 12.6 14.2 12 20 C11.4 14.2 8.8 11.6 3 11 C8.8 10.4 11.4 7.8 12 2 Z"
          fill="url(#sparkGrad)"
        />
      </svg>

      <div className="flex items-center gap-3 mb-12">
        <span className="font-display text-2xl font-semibold tracking-wide">CaseBank</span>
      </div>

      <h1 className="font-display text-[clamp(2.1rem,3.6vw,2.8rem)] font-semibold leading-tight mb-4 max-w-[19ch]">
        Tu manual interactivo de <span className="text-spark-gold">CASEBANK</span>
      </h1>
      <p className="text-lg leading-relaxed max-w-[34ch]">
        Consulta cualquier procedimiento del sistema y pregunta a la IA tus casos específicos.
      </p>

      <div className="hidden md:flex flex-col gap-3.5 mt-12">
        <div className="flex items-center gap-3 text-[1.05rem] before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-spark-gold before:flex-shrink-0">
          Busca por capítulo, sección o palabra clave
        </div>
        <div className="flex items-center gap-3 text-[1.05rem] before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-spark-gold before:flex-shrink-0">
          Pregunta directamente al asistente si tienes dudas
        </div>
      </div>
    </div>
  )
}
