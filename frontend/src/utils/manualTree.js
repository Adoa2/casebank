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
      currentChapter = { id: 'sec-sin-capitulo', title: 'Introducción', subchapters: [] }
      chapters.push(currentChapter)
    }

    currentChapter.subchapters.push({
      id: `sec-${seccion.id}`,
      seccionId: seccion.id,
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

// Reconstruye la jerarquia real (capitulo > seccion > subseccion > ...)
// usando el campo "nivel", en vez de aplanar todo bajo el capitulo como
// hace buildManualTree. Se usa para los combos encadenados del formulario
// de videos formativos.
export function buildJerarquiaAnidada(secciones) {
  const raiz = []
  const pila = [] // { nivel, nodo }

  for (const seccion of secciones) {
    const nodo = {
      id: seccion.id,
      titulo: seccion.titulo,
      nivel: seccion.nivel,
      hijos: [],
    }

    while (pila.length && pila[pila.length - 1].nivel >= seccion.nivel) {
      pila.pop()
    }

    if (pila.length === 0) {
      raiz.push(nodo)
    } else {
      pila[pila.length - 1].nodo.hijos.push(nodo)
    }

    pila.push({ nivel: seccion.nivel, nodo })
  }

  return raiz
}