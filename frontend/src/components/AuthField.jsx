export default function AuthField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  ...rest
}) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-1.5">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full px-3.5 py-3 border border-line rounded-[10px] text-base text-ink bg-white transition-shadow focus:outline-none focus:border-brand-blue focus:ring-[3px] focus:ring-brand-blue/15"
        {...rest}
      />
    </div>
  )
}
