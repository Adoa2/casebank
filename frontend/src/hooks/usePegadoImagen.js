// Pegado de capturas con Ctrl+V en formularios, sin tener que hacer clic antes en la caja de la imagen.
// Lo usan el formulario de errores (imagen de evidencia) y el de videos con IA (captura de cada paso).
import { useCallback, useEffect, useRef, useState } from 'react'

// --- Lectura del portapapeles -------------------------------------------------

/** Devuelve el primer archivo de imagen del evento paste, o null si no trae ninguno. */
function imagenDelEvento(event) {
  const items = Array.from(event.clipboardData?.items || [])
  const item = items.find((entry) => entry.kind === 'file' && entry.type.startsWith('image/'))
  return item?.getAsFile() || null
}

/** Indica si el elemento es un campo donde se escribe texto (input de texto, textarea o editable). */
function esCampoDeTexto(elemento) {
  if (!elemento) return false
  if (elemento.isContentEditable) return true
  if (elemento.tagName === 'TEXTAREA') return true
  if (elemento.tagName !== 'INPUT') return false
  return ['text', 'search', 'email', 'url', 'tel', 'number', 'password', ''].includes(elemento.type)
}

/**
 * Lee una imagen del portapapeles con la API del navegador (botón "Pegar imagen").
 * Lanza un Error con un mensaje claro si el navegador, el permiso o el contenido no lo permiten.
 */
export async function leerImagenDelPortapapeles() {
  if (!navigator.clipboard?.read) {
    throw new Error('Tu navegador no permite leer el portapapeles desde la página. Usa Ctrl+V para pegar la imagen.')
  }
  let items
  try {
    items = await navigator.clipboard.read()
  } catch {
    throw new Error('No se dio permiso para leer el portapapeles. Usa Ctrl+V para pegar la imagen.')
  }
  for (const item of items) {
    const tipo = item.types.find((t) => t.startsWith('image/'))
    if (tipo) {
      const blob = await item.getType(tipo)
      const extension = tipo.split('/')[1] || 'png'
      return new File([blob], `captura.${extension}`, { type: tipo })
    }
  }
  throw new Error('El portapapeles no tiene una imagen. Copia una captura e inténtalo de nuevo.')
}

// --- Hook ----------------------------------------------------------------------

/**
 * Escucha el evento paste en todo el documento mientras `activo` sea true y envía
 * la imagen pegada al destino correcto, llamando a onPegar(idDestino, archivo).
 *
 * Destino, en este orden:
 *   1. El destino que contiene el elemento con el foco (ej. el texto de un paso).
 *   2. El destino que tiene el mouse encima.
 *   3. destinoPorDefecto, solo si está montado en pantalla (formularios con una sola caja).
 * Si no hay destino, no hace nada.
 *
 * Si el portapapeles no trae imagen, no se intercepta. Si trae imagen y también texto
 * y el foco está en un campo de texto, se respeta el pegado normal del texto.
 *
 * Cada destino se registra con propsDestino(id), que se esparce en su contenedor.
 * destinoResaltado es el destino con foco o con el mouse encima, para marcarlo visualmente.
 */
export default function usePegadoImagen({ activo, onPegar, destinoPorDefecto = null }) {
  const elementosRef = useRef(new Map())
  const hoverRef = useRef(null)
  const onPegarRef = useRef(onPegar)
  const [destinoFoco, setDestinoFoco] = useState(null)
  const [destinoHover, setDestinoHover] = useState(null)

  useEffect(() => {
    onPegarRef.current = onPegar
  }, [onPegar])

  useEffect(() => {
    if (!activo) {
      hoverRef.current = null
      setDestinoFoco(null)
      setDestinoHover(null)
      return undefined
    }

    function destinoConFoco() {
      const enfocado = document.activeElement
      if (!enfocado || enfocado === document.body) return null
      for (const [id, elemento] of elementosRef.current) {
        if (elemento.contains(enfocado)) return id
      }
      return null
    }

    function manejarPegado(event) {
      if (event.defaultPrevented) return
      const archivo = imagenDelEvento(event)
      if (!archivo) return

      const traeTexto = Array.from(event.clipboardData?.types || []).includes('text/plain')
      if (traeTexto && esCampoDeTexto(document.activeElement)) return

      let destino = destinoConFoco()
      if (destino === null && hoverRef.current !== null && elementosRef.current.has(hoverRef.current)) {
        destino = hoverRef.current
      }
      if (destino === null && destinoPorDefecto !== null && elementosRef.current.has(destinoPorDefecto)) {
        destino = destinoPorDefecto
      }
      if (destino === null) return

      event.preventDefault()
      onPegarRef.current?.(destino, archivo)
    }

    document.addEventListener('paste', manejarPegado)
    return () => document.removeEventListener('paste', manejarPegado)
  }, [activo, destinoPorDefecto])

  const propsDestino = useCallback(
    (id) => ({
      // React llama a la ref con null y luego con el elemento en cada render; el
      // mouse encima se conserva y al pegar se comprueba que el destino siga montado.
      ref: (elemento) => {
        if (elemento) {
          elementosRef.current.set(id, elemento)
        } else {
          elementosRef.current.delete(id)
        }
      },
      onMouseEnter: () => {
        hoverRef.current = id
        setDestinoHover(id)
      },
      onMouseLeave: () => {
        if (hoverRef.current === id) hoverRef.current = null
        setDestinoHover((actual) => (actual === id ? null : actual))
      },
      onFocus: () => setDestinoFoco(id),
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setDestinoFoco((actual) => (actual === id ? null : actual))
        }
      },
    }),
    []
  )

  return { propsDestino, destinoResaltado: destinoFoco ?? destinoHover }
}
