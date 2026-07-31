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
export default function AuthImage({ nombreArchivo, alt }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelado = false
    let urlActual = null

    async function cargarImagen() {
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
    <div className="border border-line rounded-lg overflow-hidden bg-paper aspect-video">
      <img src={blobUrl} alt={alt} className="w-full h-full object-contain" loading="lazy" />
    </div>
  )
}