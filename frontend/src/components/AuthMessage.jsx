const STYLES = {
  error: 'bg-red-50 border-red-200 text-red-700',
  success: 'bg-green-50 border-green-200 text-green-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
}

export default function AuthMessage({ text, type }) {
  if (!text) return null

  return (
    <div className={`text-sm px-3.5 py-2.5 rounded-lg mb-5 leading-relaxed border ${STYLES[type] || STYLES.info}`}>
      {text}
    </div>
  )
}
