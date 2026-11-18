import React, { useEffect, useRef, useState } from "react";
import {
  generarVideo,
  actualizarJobVideoGeneracion,
  reintentarEstadoJob,
  subirImagenVideoGeneracion,
} from "../api/videoGeneration";
import VideoGenerationStatusBadge from "./Videogenerationstatusbadge";

const TIPOS_PERMITIDOS = ["image/jpeg", "image/jpg", "image/png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const POLL_INTERVAL_MS = 6000;

function pasoVacio() {
  return { texto: "", imagenUrl: null };
}

export default function VideoGenerationFormModal({ isOpen, onClose, onCompletado, jobParaEditar }) {
  const editando = Boolean(jobParaEditar);

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [pasos, setPasos] = useState([pasoVacio()]);
  const [puntos, setPuntos] = useState("");
  const [subiendoIndex, setSubiendoIndex] = useState(null);

  const [job, setJob] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState(null);

  const pollRef = useRef(null);
  const fileInputRef = useRef(null);
  const indiceParaSubidaRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    if (jobParaEditar) {
      setTitulo(jobParaEditar.titulo || "");
      setDescripcion(jobParaEditar.descripcion_inconveniente || "");
      setPasos(
        jobParaEditar.pasos_json?.length
          ? jobParaEditar.pasos_json.map((p) => ({ texto: p.texto || "", imagenUrl: p.imagen_url || null }))
          : [pasoVacio()]
      );
      setPuntos(jobParaEditar.puntos_a_considerar || "");
    } else {
      setTitulo("");
      setDescripcion("");
      setPasos([pasoVacio()]);
      setPuntos("");
    }
    setJob(null);
    setErrorGeneral(null);
  }, [isOpen, jobParaEditar]);

  useEffect(() => {
    if (job && job.estado === "procesando") {
      pollRef.current = setInterval(async () => {
        try {
          const actualizado = await reintentarEstadoJob(job.id);
          setJob(actualizado);
          if (actualizado.estado === "completado" || actualizado.estado === "fallido") {
            clearInterval(pollRef.current);
            if (actualizado.estado === "completado" && onCompletado) {
              onCompletado(actualizado);
            }
          }
        } catch (err) {
          console.error("Error consultando estado del job:", err);
        }
      }, POLL_INTERVAL_MS);

      return () => clearInterval(pollRef.current);
    }
  }, [job, onCompletado]);

  if (!isOpen) return null;

  function actualizarTextoPaso(index, valor) {
    setPasos((prev) => prev.map((p, i) => (i === index ? { ...p, texto: valor } : p)));
  }

  function agregarPaso() {
    setPasos((prev) => [...prev, pasoVacio()]);
  }

  function quitarPaso(index) {
    setPasos((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function subirImagenParaPaso(index, file) {
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setErrorGeneral("Solo se permiten imágenes JPG, JPEG o PNG.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorGeneral("La imagen no puede superar los 5 MB.");
      return;
    }
    setSubiendoIndex(index);
    setErrorGeneral(null);
    try {
      const { url } = await subirImagenVideoGeneracion(file);
      setPasos((prev) => prev.map((p, i) => (i === index ? { ...p, imagenUrl: url } : p)));
    } catch (err) {
      setErrorGeneral(err.message || "No se pudo subir la imagen.");
    } finally {
      setSubiendoIndex(null);
    }
  }

  function abrirSelectorArchivo(index) {
    indiceParaSubidaRef.current = index;
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const index = indiceParaSubidaRef.current;
    if (file && index !== null) {
      subirImagenParaPaso(index, file);
    }
  }

  function handlePegarImagen(index, event) {
    const item = Array.from(event.clipboardData?.items || []).find((entry) =>
      entry.type.startsWith("image/")
    );
    const file = item?.getAsFile();
    if (file) {
      event.preventDefault();
      subirImagenParaPaso(index, file);
    }
  }

  function quitarImagenPaso(index) {
    setPasos((prev) => prev.map((p, i) => (i === index ? { ...p, imagenUrl: null } : p)));
  }

  async function handleGenerar(e) {
    e.preventDefault();
    setErrorGeneral(null);

    const pasosConTexto = pasos.filter((p) => p.texto.trim());
    if (!titulo.trim() || !descripcion.trim() || pasosConTexto.length === 0) {
      setErrorGeneral("Completá el título, la descripción, y al menos un paso con texto.");
      return;
    }

    const payload = {
      titulo: titulo.trim(),
      descripcionInconveniente: descripcion.trim(),
      pasos: pasosConTexto.map((p) => ({ texto: p.texto.trim(), imagen_url: p.imagenUrl })),
      puntosAConsiderar: puntos.trim() || null,
    };

    setEnviando(true);
    try {
      const resultado = editando
        ? await actualizarJobVideoGeneracion(jobParaEditar.id, payload)
        : await generarVideo(payload);
      setJob(resultado);
    } catch (err) {
      setErrorGeneral(err.message || "No se pudo enviar el video para generación.");
    } finally {
      setEnviando(false);
    }
  }

  function handleCerrar() {
    if (pollRef.current) clearInterval(pollRef.current);
    setJob(null);
    setErrorGeneral(null);
    onClose();
  }

  const generando = enviando || (job && job.estado === "procesando");

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {editando ? "Editar y regenerar video tutorial" : "Generar video tutorial"}
          </h2>
          <button onClick={handleCerrar} className="text-gray-500 hover:text-gray-800">
            &times;
          </button>
        </div>

        {job ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="font-medium">{job.titulo || titulo}</span>
              <VideoGenerationStatusBadge estado={job.estado} />
            </div>

            {job.estado === "procesando" && (
              <p className="text-sm text-gray-600">
                Shotstack está renderizando el video. Esto puede tardar desde unos segundos
                hasta un par de minutos. Podés cerrar esta ventana; el video aparecerá
                automáticamente en la sección de tutoriales cuando esté listo.
              </p>
            )}

            {job.estado === "completado" && (
              <div className="space-y-2">
                <p className="text-sm text-green-700">El video se generó correctamente.</p>
                {job.video_url && <video controls className="w-full rounded" src={job.video_url} />}
              </div>
            )}

            {job.estado === "fallido" && (
              <p className="text-sm text-red-700">
                {job.error_mensaje || "Ocurrió un error generando el video."}
              </p>
            )}

            <div className="flex justify-end">
              <button onClick={handleCerrar} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleGenerar} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">Título</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Descripción del inconveniente</label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="w-full border rounded px-3 py-2"
                rows={3}
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">Pasos de la solución</label>
                <button
                  type="button"
                  onClick={agregarPaso}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  + Agregar paso
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Cada paso se convierte en una escena del video, con su propia imagen (opcional,
                exacta a ese paso).
              </p>

              <div className="space-y-3">
                {pasos.map((paso, index) => (
                  <div key={index} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-gray-500">Paso {index + 1}</p>
                      {pasos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => quitarPaso(index)}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Quitar
                        </button>
                      )}
                    </div>

                    <textarea
                      value={paso.texto}
                      onChange={(e) => actualizarTextoPaso(index, e.target.value)}
                      placeholder="Describí este paso..."
                      className="w-full border rounded px-3 py-2 text-sm"
                      rows={2}
                    />

                    <div
                      tabIndex={0}
                      role="button"
                      onPaste={(event) => handlePegarImagen(index, event)}
                      onClick={() => abrirSelectorArchivo(index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") abrirSelectorArchivo(index);
                      }}
                      className="mt-2 flex min-h-[64px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-center outline-none transition hover:border-blue-400 focus:border-blue-500"
                    >
                      {subiendoIndex === index ? (
                        <span className="text-xs text-gray-500">Subiendo imagen...</span>
                      ) : paso.imagenUrl ? (
                        <div className="relative">
                          <img src={paso.imagenUrl} alt="" className="h-16 rounded border object-contain" />
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              quitarImagenPaso(index);
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                          >
                            &times;
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">
                          Imagen para este paso (opcional) — clic para elegir un archivo, o
                          hacé clic acá y pegá con Ctrl+V
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Puntos a considerar (opcional)</label>
              <textarea
                value={puntos}
                onChange={(e) => setPuntos(e.target.value)}
                className="w-full border rounded px-3 py-2"
                rows={2}
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {errorGeneral && <p className="text-sm text-red-700">{errorGeneral}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCerrar}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={generando}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {generando ? "Generando..." : editando ? "Guardar y regenerar" : "Generar Video"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}