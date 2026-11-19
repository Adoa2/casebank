// Formulario para crear un trabajo de video con IA (o uno nuevo a partir de otro existente).
// Crear es rápido: el trabajo queda "En cola" y la sección de videos lo va avanzando.
import React, { useEffect, useRef, useState } from 'react'
import { crearTrabajoVideoIA, subirImagenVideoIA } from '../api/videosIA'
import BotonAgregarPunteado from './BotonAgregarPunteado'
import usePegadoImagen, { leerImagenDelPortapapeles } from '../hooks/usePegadoImagen'

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_FILE_SIZE = 5 * 1024 * 1024

function pasoVacio() {
  return { texto: '', imagenUrl: null }
}

/**
 * Modal de creación. Con trabajoBase precarga sus datos para generar una
 * versión nueva ("Editar y regenerar"); el trabajo original no se modifica.
 */
export default function VideoGenerationFormModal({ isOpen, onClose, onCreado, trabajoBase, configuracion }) {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [pasos, setPasos] = useState([pasoVacio()])
  const [puntos, setPuntos] = useState('')
  // Pasos con una imagen subiéndose; un Set permite pegar varias capturas seguidas
  const [subiendo, setSubiendo] = useState(() => new Set())
  const [enviando, setEnviando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState(null)

  const fileInputRef = useRef(null)
  const indiceParaSubidaRef = useRef(null)
  // Campos de texto de cada paso, para llevar la vista y el cursor al paso recién agregado
  const pasoTextareaRefs = useRef([])
  const [pasoAEnfocar, setPasoAEnfocar] = useState(null)

  useEffect(() => {
    if (pasoAEnfocar === null) return
    const campo = pasoTextareaRefs.current[pasoAEnfocar]
    if (campo) {
      campo.scrollIntoView({ behavior: 'smooth', block: 'center' })
      campo.focus({ preventScroll: true })
    }
    setPasoAEnfocar(null)
  }, [pasoAEnfocar])

  useEffect(() => {
    if (!isOpen) return
    setTitulo(trabajoBase?.titulo || '')
    setDescripcion(trabajoBase?.descripcion_inconveniente || '')
    setPasos(
      trabajoBase?.pasos?.length
        ? trabajoBase.pasos.map((p) => ({ texto: p.texto || '', imagenUrl: p.imagen_url || null }))
        : [pasoVacio()]
    )
    setPuntos(trabajoBase?.puntos_a_considerar || '')
    setErrorGeneral(null)
  }, [isOpen, trabajoBase])

  // --- Pegado de capturas con Ctrl+V ---
  // El destino es el paso con el foco o con el mouse encima (ver usePegadoImagen).
  // subirImagenRef apunta a la función del render actual, definida más abajo.
  const subirImagenRef = useRef(null)
  const { propsDestino, destinoResaltado } = usePegadoImagen({
    activo: isOpen,
    onPegar: (index, file) => subirImagenRef.current?.(index, file),
  })

  if (!isOpen) return null

  // --- Límites (los valida también el backend) ---
  const maxEscenas = configuracion?.max_escenas
  const maxCaracteres = configuracion?.max_caracteres
  const escenas = 1 + pasos.filter((p) => p.texto.trim()).length + (puntos.trim() ? 1 : 0)
  const caracteres = descripcion.trim().length + pasos.reduce((total, p) => total + p.texto.trim().length, 0) + puntos.trim().length
  const excedeEscenas = maxEscenas && escenas > maxEscenas
  const excedeCaracteres = maxCaracteres && caracteres > maxCaracteres
  // Escenas que ocuparía el formulario si se llenan todos los pasos (incluidos los vacíos);
  // al llegar al máximo ya no se pueden agregar más pasos.
  const escenasPosibles = 1 + pasos.length + (puntos.trim() ? 1 : 0)
  const limitePasosAlcanzado = Boolean(maxEscenas) && escenasPosibles >= maxEscenas
  // --- fin límites ---

  function actualizarTextoPaso(index, valor) {
    setPasos((prev) => prev.map((p, i) => (i === index ? { ...p, texto: valor } : p)))
  }

  function agregarPaso() {
    if (limitePasosAlcanzado) return
    setPasos((prev) => [...prev, pasoVacio()])
    setPasoAEnfocar(pasos.length)
  }

  function quitarPaso(index) {
    setPasos((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  async function subirImagenParaPaso(index, file) {
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setErrorGeneral('Solo se permiten imágenes JPG, JPEG o PNG.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorGeneral('La imagen no puede superar los 5 MB.')
      return
    }
    setSubiendo((prev) => new Set(prev).add(index))
    setErrorGeneral(null)
    try {
      const { url } = await subirImagenVideoIA(file)
      setPasos((prev) => prev.map((p, i) => (i === index ? { ...p, imagenUrl: url } : p)))
    } catch (err) {
      setErrorGeneral(err.message || 'No se pudo subir la imagen.')
    } finally {
      setSubiendo((prev) => {
        const siguiente = new Set(prev)
        siguiente.delete(index)
        return siguiente
      })
    }
  }
  subirImagenRef.current = subirImagenParaPaso

  // Botón "Pegar imagen": complemento de Ctrl+V usando la API del portapapeles
  async function pegarDesdeBoton(index) {
    try {
      const file = await leerImagenDelPortapapeles()
      subirImagenParaPaso(index, file)
    } catch (err) {
      setErrorGeneral(err.message)
    }
  }

  function abrirSelectorArchivo(index) {
    indiceParaSubidaRef.current = index
    fileInputRef.current?.click()
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const index = indiceParaSubidaRef.current
    if (file && index !== null) subirImagenParaPaso(index, file)
  }

  function quitarImagenPaso(index) {
    setPasos((prev) => prev.map((p, i) => (i === index ? { ...p, imagenUrl: null } : p)))
  }

  async function handleGenerar(e) {
    e.preventDefault()
    setErrorGeneral(null)

    const pasosConTexto = pasos.filter((p) => p.texto.trim())
    if (!titulo.trim() || !descripcion.trim() || pasosConTexto.length === 0) {
      setErrorGeneral('Completa el título, la descripción y al menos un paso con texto.')
      return
    }
    if (excedeEscenas) return setErrorGeneral(`El video tendría ${escenas} escenas; el máximo es ${maxEscenas}.`)
    if (excedeCaracteres) return setErrorGeneral(`El texto suma ${caracteres} caracteres; el máximo es ${maxCaracteres}.`)

    setEnviando(true)
    try {
      const trabajo = await crearTrabajoVideoIA({
        titulo: titulo.trim(),
        descripcionInconveniente: descripcion.trim(),
        pasos: pasosConTexto.map((p) => ({ texto: p.texto.trim(), imagen_url: p.imagenUrl })),
        puntosAConsiderar: puntos.trim() || null,
      })
      onCreado?.(trabajo)
      onClose()
    } catch (err) {
      setErrorGeneral(err.message || 'No se pudo crear el video.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">{trabajoBase ? 'Generar nueva versión' : 'Generar video tutorial'}</h2>
          <button type="button" onClick={onClose} disabled={enviando} className="text-gray-500 hover:text-gray-800">
            &times;
          </button>
        </div>

        <form onSubmit={handleGenerar} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">Título</label>
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full border rounded px-3 py-2" required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Descripción del inconveniente</label>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full border rounded px-3 py-2" rows={3} required />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Pasos de la solución</label>
            <p className="text-xs text-gray-500 mb-2">
              Cada paso se convierte en una escena del video, con su propia captura (opcional).
            </p>

            <div className="space-y-3">
              {pasos.map((paso, index) => (
                <div
                  key={index}
                  {...propsDestino(index)}
                  className={`rounded-lg border p-3 transition ${
                    destinoResaltado === index ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-500">Paso {index + 1}</p>
                    {pasos.length > 1 && (
                      <button type="button" onClick={() => quitarPaso(index)} className="text-xs font-semibold text-red-600 hover:underline">
                        Quitar
                      </button>
                    )}
                  </div>

                  <textarea
                    ref={(el) => {
                      pasoTextareaRefs.current[index] = el
                    }}
                    aria-label={`Texto del paso ${index + 1}`}
                    value={paso.texto}
                    onChange={(e) => actualizarTextoPaso(index, e.target.value)}
                    placeholder="Describe este paso..."
                    className="w-full border rounded px-3 py-2 text-sm"
                    rows={2}
                  />

                  <div
                    tabIndex={0}
                    role="button"
                    onClick={() => abrirSelectorArchivo(index)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') abrirSelectorArchivo(index)
                    }}
                    className="mt-2 flex min-h-[64px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-center outline-none transition hover:border-blue-400 focus:border-blue-500"
                  >
                    {subiendo.has(index) ? (
                      <span className="text-xs text-gray-500">Subiendo imagen...</span>
                    ) : paso.imagenUrl ? (
                      <div className="relative">
                        <img src={paso.imagenUrl} alt="" className="h-16 rounded border object-contain" />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            quitarImagenPaso(index)
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                        >
                          &times;
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">
                        Captura para este paso (opcional): haz clic para elegir un archivo, o presiona Ctrl+V para pegar aquí
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => pegarDesdeBoton(index)}
                      disabled={subiendo.has(index)}
                      className="text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                    >
                      Pegar imagen
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <BotonAgregarPunteado
                onClick={agregarPaso}
                disabled={limitePasosAlcanzado}
                aria-describedby={limitePasosAlcanzado ? 'aviso-limite-pasos' : undefined}
              >
                + Agregar paso
              </BotonAgregarPunteado>
              {limitePasosAlcanzado && (
                <p id="aviso-limite-pasos" className="text-xs text-gray-500">
                  Llegaste al máximo de {maxEscenas} escenas por video (la introducción y los puntos a considerar
                  también cuentan).
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Puntos a considerar (opcional)</label>
            <textarea value={puntos} onChange={(e) => setPuntos(e.target.value)} className="w-full border rounded px-3 py-2" rows={2} />
          </div>

          {configuracion && (
            <p className={`text-xs ${excedeEscenas || excedeCaracteres ? 'text-red-700' : 'text-gray-500'}`}>
              {escenas} de {maxEscenas} escenas · {caracteres} de {maxCaracteres} caracteres · máximo{' '}
              {Math.round(configuracion.max_duracion_segundos / 60)} minutos de video, en {configuracion.resolucion}
            </p>
          )}

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" onChange={handleFileInputChange} className="hidden" />

          {errorGeneral && <p className="text-sm text-red-700">{errorGeneral}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={enviando} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando || subiendo.size > 0 || excedeEscenas || excedeCaracteres}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {enviando ? 'Creando...' : 'Generar video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
