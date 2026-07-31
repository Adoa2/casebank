// frontend/src/utils/manualTree.js

/**
 * Convierte la lista plana de secciones (tal como viene de GET /api/manual)
 * en un arbol de 2 niveles: capitulos (nivel 1) -> subcapitulos.
 *
 * El manual real tiene hasta 4 niveles de jerarquia (nivel 1 a 4), pero el
 * sidebar actual solo maneja 2 (capitulo con lista de subcapitulos). En vez
 * de reescribir el sidebar como arbol recursivo, se aplanan los niveles 2/3/4
 * dentro del capitulo correspondiente, conservando el numero de nivel real
 * en cada subcapitulo para poder indentarlo visualmente.
 */
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