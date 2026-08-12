import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { authHeaders } from '../api/authToken'

/**
 * Los <img> nativos no pueden mandar headers personalizados (como
 * Authorization: Bearer ...), asi que no se puede apuntar el src directo
 * al endpoint protegido. En su lugar, se descarga la imagen con fetch
 * (que si lleva el token) y se convierte en un blob URL local para
 * mostrarla. Si falla la carga (imagen inexistente, sesion vencida, etc.)
 * el componente simplemente no renderiza nada.
 */
export default function AuthImage({ nombreArchivo, alt, onDimensions }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [error, setError] = useState(false)
  const [dimensions, setDimensions] = useState(null)

  useEffect(() => {
    let cancelado = false
    let urlActual = null

    async function cargarImagen() {
      setError(false)
      setDimensions(null)
      try {
        const res = await fetch(`${API_BASE_URL}/api/manual/imagenes/${nombreArchivo}`, {
          headers: authHeaders(),
        })
        if (!res.ok) throw new Error('No se pudo cargar la imagen.')

        const blob = await res.blob()
        urlActual = URL.createObjectURL(blob)

        if (!cancelado) {
          setBlobUrl(urlActual)
        } else {
          URL.revokeObjectURL(urlActual)
        }
      } catch {
        if (!cancelado) setError(true)
      }
    }

    cargarImagen()

    return () => {
      cancelado = true
      if (urlActual) URL.revokeObjectURL(urlActual)
    }
  }, [nombreArchivo])

  if (error || !blobUrl) {
    return null
  }

  return (
    <div
      className="mx-auto w-full overflow-hidden rounded-lg border border-line bg-paper"
      style={{
        maxWidth: dimensions ? `${dimensions.width}px` : undefined,
        aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : '16 / 9',
      }}
    >
      <img
        src={blobUrl}
        alt={alt}
        className="h-full w-full object-contain"
        loading="lazy"
        onLoad={(event) => {
          const nextDimensions = {
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          }
          setDimensions(nextDimensions)
          onDimensions?.(nextDimensions)
        }}
      />
    </div>
  )
}