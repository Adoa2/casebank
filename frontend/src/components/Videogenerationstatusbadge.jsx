// Etiqueta de estado de un trabajo de video con IA.
import React from 'react'

const ESTILOS = {
  pendiente: 'bg-gray-200 text-gray-700',
  procesando: 'bg-yellow-100 text-yellow-800 animate-pulse',
  descarga_pendiente: 'bg-orange-100 text-orange-800',
  completado: 'bg-green-100 text-green-800',
  fallido: 'bg-red-100 text-red-800',
  cancelado: 'bg-gray-200 text-gray-600',
}

const TEXTOS = {
  pendiente: 'En cola',
  procesando: 'Generando video...',
  descarga_pendiente: 'Descarga pendiente',
  completado: 'Completado',
  fallido: 'Error',
  cancelado: 'Cancelado',
}

/** Muestra el estado del trabajo con su color. */
export default function VideoGenerationStatusBadge({ estado }) {
  const clase = ESTILOS[estado] || ESTILOS.pendiente
  const texto = TEXTOS[estado] || estado

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${clase}`}>
      {texto}
    </span>
  )
}
