// frontend/src/utils/manualTree.js

export function buildManualTree(secciones) {
  const chapters = []
  let currentChapter = null

  for (const seccion of secciones) {
    if (seccion.nivel === 1) {
      currentChapter = {
        id: `sec-${seccion.id}`,
        title: seccion.titulo,
        subchapters: [],
      }
      chapters.push(currentChapter)
      continue
    }

    if (!currentChapter) {
      // Seguridad: si el manual empezara con un nivel > 1 sin capitulo previo
      currentChapter = { id: 'sec-sin-capitulo', title: 'Introducción', subchapters: [] }
      chapters.push(currentChapter)
    }

    currentChapter.subchapters.push({
      id: `sec-${seccion.id}`,
      title: seccion.titulo,
      nivel: seccion.nivel,
      contenido: seccion.contenido,
      paginaInicio: seccion.pagina_inicio,
      paginaFin: seccion.pagina_fin,
      imagenes: seccion.imagenes || [],
    })
  }

  return chapters
}