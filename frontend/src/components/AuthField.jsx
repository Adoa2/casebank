import { useState } from 'react'

export default function AuthField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  compact = false,
  ...rest
}) {
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className={compact ? 'mb-3' : 'mb-5'}>
      <label htmlFor={id} className={`${compact ? 'mb-1.5' : 'mb-2'} block text-[0.78rem] font-bold text-[#14254c]`}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-[#8796b6]" aria-hidden="true">
          {isPassword ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>
          )}
        </span>
        <input
          id={id}
          name={id}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`${compact ? 'h-12' : 'h-[52px]'} w-full rounded-xl border border-[#d9e1ef] bg-white pl-12 pr-12 text-[0.92rem] text-ink shadow-sm outline-none transition placeholder:text-[#8a98b5] focus:border-brand-blue focus:ring-[3px] focus:ring-brand-blue/10`}
          {...rest}
        />
        {isPassword && (
          <button type="button" onClick={() => setRevealed((current) => !current)} className="absolute inset-y-0 right-4 grid place-items-center text-[#8796b6] hover:text-brand-blue" aria-label={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}
