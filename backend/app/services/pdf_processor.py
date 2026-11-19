# Extrae texto estructurado e imágenes del PDF del manual usando PyMuPDF.
# Genera manual_structure.json con secciones mapeadas al índice digital (TOC) del PDF.
import fitz  # PyMuPDF
import bisect
import hashlib
import os
import re
import json
from collections import defaultdict

PRIMERA_PAGINA_CONTENIDO = 9
MIN_ICON_SIZE = 15  # px
# Los PDF del manual incluyen iconos cuadrados de 40x40 usados como
# viñetas/numeración. No aportan información al lector y al ampliarlos se
# pixelan, por lo que se excluyen sin afectar capturas angostas.
MAX_DECORATIVE_ICON_PX = 64
RENDER_FULL_PAGE = False

# Umbral de fusion de parrafos (usado como fallback si no hay calibracion)
UMBRAL_FUSION_PARRAFO = 0.6

IMG_MARKER_PATTERN = re.compile(r"\[IMG:([^\]]+)\]")

# --- Filtro de cabeceras y pies de página -----------------------------------
_HEADER_FRAC = 0.10
_FOOTER_FRAC = 0.10
_MIN_PAGES_FRAC = 0.10
_HF_DOMINANCE = 0.75

# --- Párrafo / lista / negrita -----------------------------------------------
# Detecta fin de oración terminal; cuando la línea ANTERIOR termina así,
# aplicamos la condición de sangría. Si no termina así, la ignoramos
# (cubre primera-línea-indentada y justificado con última palabra al margen).
_TERMINAL_PUNCT_RE = re.compile(r'[.?!:;]\s*$')

# Número de sección al inicio de una línea (ej. "3.1.1.2. " o "**1.1. ").
# Cuando el bloque ANTERIOR termina con un título de sección, no aplicamos
# la regla de puntuación para evitar fusionarlo con el primer párrafo del cuerpo.
_SECCION_NUM_RE = re.compile(
    r'(?:^\*{0,2}\d+\.\d[\d.]*\s|^\*{0,2}[Cc]ap[íi]tulo\s)',
    re.IGNORECASE,
)

# Inicio de ítem de lista: "1. " "22. " "1) " "a. " "a) " "- " "• "
# \d{1,2} evita secciones como "3.1.1.2." y años "2024."
# [a-z] solo minúsculas para evitar encabezados en mayúsculas "I. Capítulo"
_LISTA_INICIO_RE = re.compile(
    r'^(?:'
    r'\d{1,2}[.)]\s'    # "1. " "22. " "1) "
    r'|[a-z][.)]\s'     # "a. " "a) "
    r'|[-•·–▪]\s'       # "- " "• " "▪ "
    r')'
)
_BULLET_NORM_RE = re.compile(r'^[•·–▪]\s')


def _archivo_tiene_bytes(ruta, contenido):
    """Indica si el archivo ya existe con exactamente el mismo contenido."""
    if not os.path.isfile(ruta) or os.path.getsize(ruta) != len(contenido):
        return False
    with open(ruta, "rb") as f:
        return f.read() == contenido


def normalizar_espacios(texto):
    """Convierte espacios PDF (incluido NBSP) en espacios normales."""
    return re.sub(r"\s+", " ", texto or "").strip()


def _normalizar_viñeta(texto):
    """Normaliza •·– a '- ' para consistencia."""
    return _BULLET_NORM_RE.sub("- ", texto, count=1)


def _normalizar_repeticion(texto):
    """Reemplaza dígitos por <N> para agrupar variantes de un mismo patrón."""
    return re.sub(r"\d+", "<N>", texto.strip())


def _texto_con_negrita(line):
    """
    Extrae el texto de una línea envolviendo runs de spans en negrita en
    marcadores **...**.  Runs de < 3 caracteres no se marcan (evita
    asteriscos en puntuación suelta).  Los espacios fuera de los markers
    se conservan para no alterar la tokenización.
    """
    items = []
    for span in line.get("spans", []):
        t = span.get("text", "")
        if not t:
            continue
        flags = span.get("flags", 0)
        is_bold = bool(flags & 16) or "Bold" in span.get("font", "")
        items.append((t, is_bold))

    if not items:
        return ""

    result = ""
    i = 0
    while i < len(items):
        t, bold = items[i]
        if not bold:
            result += t
            i += 1
        else:
            # Colectar todo el run en negrita
            run = t
            i += 1
            while i < len(items) and items[i][1]:
                run += items[i][0]
                i += 1
            stripped = run.strip()
            if len(stripped) >= 3:
                lead  = run[:len(run) - len(run.lstrip())]
                trail = run[len(run.rstrip()):]
                result += f"{lead}**{stripped}**{trail}"
            else:
                result += run
    return result


def _calcular_gap_tipico_documento(doc):
    """
    Escanea las primeras 100 páginas de contenido y devuelve la mediana de
    los gaps entre bloques de texto consecutivos que son plausibles de
    interlineado (gap < 150% de la altura de línea).  Fallback: None.
    """
    gaps = []
    # Solo páginas de contenido para no contaminar con interlineados de portada/índice
    scan = [i for i in range(len(doc)) if i + 1 >= PRIMERA_PAGINA_CONTENIDO][:100]
    for page_idx in scan:
        page = doc[page_idx]
        h = page.rect.height
        blocks = sorted(
            [b for b in page.get_text("dict")["blocks"]
             if b.get("type") == 0
             and b["bbox"][3] / h > _HEADER_FRAC
             and b["bbox"][1] / h < (1 - _FOOTER_FRAC)],
            key=lambda b: (round(b["bbox"][1], 0), b["bbox"][0]),
        )
        prev = None
        for block in blocks:
            if prev is not None:
                gap = block["bbox"][1] - prev["bbox"][3]
                h_line = max(1, block["bbox"][3] - block["bbox"][1])
                # Gaps menores a 1.5× la altura de línea son plausibles de interlineado
                if 0 < gap <= h_line * 1.5:
                    gaps.append(gap)
            prev = block
    if not gaps:
        return None
    gaps.sort()
    return gaps[len(gaps) // 2]


def _construir_exclusiones(doc):
    """
    Pre-scans todas las páginas de contenido para detectar imágenes y textos
    que se repiten en las franjas de cabecera o pie (logo, número de página).
    """
    total = len(doc)
    content_pages = [i for i in range(total) if i + 1 >= PRIMERA_PAGINA_CONTENIDO]
    n_content = len(content_pages)
    # Un elemento aparece en header/footer si sale en al menos _MIN_PAGES_FRAC de páginas
    threshold = n_content * _MIN_PAGES_FRAC

    img_zones  = defaultdict(list)
    text_zones = defaultdict(list)

    for page_num in content_pages:
        page = doc[page_num]
        h = page.rect.height
        blocks = page.get_text("dict")["blocks"]

        for block in blocks:
            bbox = block["bbox"]
            y_top_rel = bbox[1] / h
            y_bot_rel = bbox[3] / h

            # Clasificar el bloque en la franja de la página donde aparece
            if y_bot_rel <= _HEADER_FRAC:
                zone = "header"
            elif y_top_rel >= (1 - _FOOTER_FRAC):
                zone = "footer"
            else:
                zone = "body"

            if block.get("type") == 1:
                bw = bbox[2] - bbox[0]
                bh = bbox[3] - bbox[1]
                if bw < MIN_ICON_SIZE or bh < MIN_ICON_SIZE:
                    continue
                wpx = block.get("width", bw)
                hpx = block.get("height", bh)
                if wpx <= MAX_DECORATIVE_ICON_PX and hpx <= MAX_DECORATIVE_ICON_PX:
                    continue
                img_bytes = block.get("image")
                if not img_bytes:
                    continue
                # Usar MD5 del contenido binario como clave de deduplicación
                digest = hashlib.md5(img_bytes).hexdigest()
                img_zones[digest].append(zone)

            elif block.get("type") == 0 and zone != "body":
                raw = " ".join(
                    span.get("text", "")
                    for line in block.get("lines", [])
                    for span in line.get("spans", [])
                ).strip()
                if raw:
                    # Normalizar dígitos para agrupar "Página 3" con "Página 42"
                    text_zones[_normalizar_repeticion(raw)].append(zone)

    excluded_img_hashes = set()
    for digest, zones in img_zones.items():
        if len(zones) < threshold:
            continue
        hf = sum(1 for z in zones if z != "body")
        if hf / len(zones) >= _HF_DOMINANCE:
            excluded_img_hashes.add(digest)

    excluded_text_patterns = {
        pat for pat, zones in text_zones.items() if len(zones) >= threshold
    }

    print(f"  Exclusiones detectadas: {len(excluded_img_hashes)} imagen(es), "
          f"{len(excluded_text_patterns)} patrón(es) de texto")
    return excluded_img_hashes, excluded_text_patterns


def bloques_forman_mismo_parrafo(anterior, actual, gap_tipico_doc=None):
    """
    Determina si dos bloques consecutivos son líneas del mismo párrafo.

    Mejoras respecto a la versión original:
    - Umbral calibrado con el interlineado real del documento (gap_tipico_doc)
      en lugar de un ratio fijo sobre la altura de línea.
    - Si la última línea del bloque anterior NO termina en puntuación terminal
      (. ? ! : ;) se ignora la diferencia de sangría.  Esto cubre dos casos
      que antes fallaban:
        a) Primera línea con indentación de párrafo + continuación al margen
           izquierdo ("...cuenta de préstamos al" / "cooperativista.").
        b) Texto justificado donde la última palabra queda al margen derecho
           ("...Fondos Propios, Fondos" / "Redescontados, etc.").
    """
    if not anterior or not actual:
        return False

    bbox_anterior = anterior["ultima_linea_bbox"]
    bbox_actual   = actual["primera_linea_bbox"]
    alto_anterior = max(1, bbox_anterior[3] - bbox_anterior[1])
    alto_actual   = max(1, bbox_actual[3]   - bbox_actual[1])
    alto_linea    = max(alto_anterior, alto_actual)
    gap_vertical  = bbox_actual[1] - bbox_anterior[3]

    # Umbral: interlineado calibrado × 1.4, o fallback al ratio fijo
    if gap_tipico_doc is not None:
        gap_umbral_max = gap_tipico_doc * 1.4
    else:
        gap_umbral_max = alto_linea * UMBRAL_FUSION_PARRAFO

    cond_gap = -alto_linea * 0.25 <= gap_vertical <= gap_umbral_max
    if not cond_gap:
        return False

    fuentes_compatibles = abs(actual["font_size"] - anterior["font_size"]) <= 1.0
    if not fuentes_compatibles:
        return False

    # Si la línea anterior NO termina en puntuación terminal Y no es un título
    # de sección, la diferencia de sangría es irrelevante (texto continúa).
    # Excepción de título: evita fusionar "3.1.1.2. Apertura..." con el
    # primer párrafo del cuerpo cuando el gap es igual al interlineado.
    texto_ant = anterior.get("texto_ultima_linea", "")
    termina_en_punt = bool(_TERMINAL_PUNCT_RE.search(texto_ant))
    es_titulo_sec   = bool(_SECCION_NUM_RE.match(texto_ant))
    if not termina_en_punt and not es_titulo_sec:
        return True

    diferencia_sangria = abs(bbox_actual[0] - bbox_anterior[0])
    return diferencia_sangria <= alto_linea * 1.5


# ---------------------------------------------------------------------------


def extract_page_content(
    page, page_num, images_dir,
    excluded_img_hashes=frozenset(),
    excluded_text_patterns=frozenset(),
    gap_tipico_doc=None,
    min_size=MIN_ICON_SIZE,
):
    """
    Recorre los bloques de la página en orden de lectura y devuelve un string
    con el texto y marcadores [IMG:...] intercalados.

    Mejoras:
    - Negrita preservada como **texto** (≥ 3 chars).
    - Ítems de lista (n. / a. / -) inician siempre un párrafo nuevo.
    - Viñetas •·– normalizadas a '- '.
    - Umbral de fusión calibrado con gap_tipico_doc.
    - Regla de puntuación terminal para la condición de sangría.
    """
    h_page = page.rect.height
    blocks = page.get_text("dict")["blocks"]

    blocks_ordenados = sorted(
        blocks, key=lambda b: (round(b["bbox"][1], 0), b["bbox"][0])
    )

    piezas = []
    idx_icono = 0
    ultimo_bloque_texto = None

    for block in blocks_ordenados:
        bbox = block["bbox"]
        y_top_rel = bbox[1] / h_page
        y_bot_rel = bbox[3] / h_page
        en_header = y_bot_rel <= _HEADER_FRAC
        en_footer = y_top_rel >= (1 - _FOOTER_FRAC)

        if block.get("type") == 0:  # bloque de texto
            lineas = []
            tamanos_fuente = []
            for line in block.get("lines", []):
                texto_linea = _texto_con_negrita(line)
                spans = line.get("spans", [])
                for span in spans:
                    if span.get("text", "").strip():
                        tamanos_fuente.append(float(span.get("size", 0)))
                texto_linea = normalizar_espacios(texto_linea)
                if texto_linea:
                    # Encabezado: todos los spans en negrita y < 120 chars
                    spans_con_texto = [s for s in spans if s.get("text", "").strip()]
                    todos_neg = bool(spans_con_texto) and all(
                        (bool(s.get("flags", 0) & 16) or "Bold" in s.get("font", ""))
                        for s in spans_con_texto
                    )
                    longitud = len(re.sub(r'\*', '', texto_linea).strip())
                    es_enc = todos_neg and longitud < 120
                    lineas.append({"texto": texto_linea, "bbox": line["bbox"],
                                   "es_encabezado": es_enc})

            if not lineas:
                continue

            font_size_bloque = (sum(tamanos_fuente) / len(tamanos_fuente)
                                if tamanos_fuente else 0)

            # Excluir bloques de cabecera/pie que coincidan con patrones repetidos
            texto_bloque_completo = " ".join(l["texto"] for l in lineas)
            if (en_header or en_footer) and excluded_text_patterns:
                if _normalizar_repeticion(texto_bloque_completo) in excluded_text_patterns:
                    continue

            # ── Detección de marcadores LÍNEA POR LÍNEA ────────────────────
            # Agrupa las líneas del bloque en sub-ítems separando en:
            #   a) Marcadores de lista (•, ▪, 1., a)) → siempre inician sub-ítem.
            #   b) Encabezados (todos los spans en negrita, < 120 chars) → inician
            #      su propio sub-ítem y la línea SIGUIENTE también inicia uno nuevo
            #      (el cuerpo no es continuación del encabezado).
            sub_items = []
            current_sub = None
            for linea in lineas:
                texto_check = linea["texto"].lstrip("*").strip()
                es_marcador = bool(_LISTA_INICIO_RE.match(texto_check))
                es_enc      = linea.get("es_encabezado", False)
                after_hdg   = current_sub is not None and current_sub.get("es_encabezado", False)
                if es_marcador or es_enc or current_sub is None or after_hdg:
                    if current_sub is not None:
                        sub_items.append(current_sub)
                    current_sub = {"lineas": [linea], "es_lista": es_marcador,
                                   "es_encabezado": es_enc}
                else:
                    current_sub["lineas"].append(linea)
            if current_sub:
                sub_items.append(current_sub)

            # ── Procesar cada sub-ítem ─────────────────────────────────────
            for sub in sub_items:
                texto_sub = " ".join(l["texto"] for l in sub["lineas"])
                es_inicio_lista = sub["es_lista"]
                es_encabezado   = sub["es_encabezado"]

                if es_inicio_lista:
                    texto_sub = _normalizar_viñeta(texto_sub)

                bloque_actual = {
                    "texto": texto_sub,
                    "bbox": block["bbox"],
                    "primera_linea_bbox": sub["lineas"][0]["bbox"],
                    "ultima_linea_bbox":  sub["lineas"][-1]["bbox"],
                    "font_size": font_size_bloque,
                    "texto_ultima_linea": sub["lineas"][-1]["texto"],
                    "es_encabezado": es_encabezado,
                }

                # Un encabezado nunca se funde con lo anterior ni con lo siguiente.
                if es_inicio_lista or es_encabezado:
                    fusionar = False
                elif ultimo_bloque_texto and ultimo_bloque_texto.get("es_encabezado"):
                    fusionar = False
                else:
                    fusionar = (
                        piezas
                        and not piezas[-1].startswith("[IMG:")
                        and bloques_forman_mismo_parrafo(
                            ultimo_bloque_texto, bloque_actual, gap_tipico_doc
                        )
                    )

                if fusionar:
                    piezas[-1] = piezas[-1] + " " + texto_sub
                else:
                    piezas.append(texto_sub)

                ultimo_bloque_texto = bloque_actual

        elif block.get("type") == 1:  # bloque de imagen
            width  = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            if width < min_size or height < min_size:
                continue

            pixel_width  = block.get("width", width)
            pixel_height = block.get("height", height)
            if (pixel_width <= MAX_DECORATIVE_ICON_PX
                    and pixel_height <= MAX_DECORATIVE_ICON_PX):
                continue

            img_bytes = block.get("image")
            ext = block.get("ext", "png")
            if not img_bytes:
                continue

            # Excluir imágenes de cabecera/pie detectadas en el pre-scan
            if (en_header or en_footer) and excluded_img_hashes:
                if hashlib.md5(img_bytes).hexdigest() in excluded_img_hashes:
                    continue

            try:
                filename = f"pagina_{page_num + 1}_icono_{idx_icono}.{ext}"
                filepath = os.path.join(images_dir, filename)
                # No reescribir imágenes idénticas: evita cambios de fecha y resincronizaciones
                if not _archivo_tiene_bytes(filepath, img_bytes):
                    with open(filepath, "wb") as f:
                        f.write(img_bytes)
                piezas.append(f"[IMG:{filename}]")
                idx_icono += 1
            except Exception as e:
                print(f"No se pudo guardar imagen en página {page_num + 1}: {e}")

            ultimo_bloque_texto = None

    return "\n\n".join(piezas)


# --- Corte de secciones por títulos -------------------------------------------
# El índice digital solo dice en qué página empieza cada sección. Varias
# secciones pueden empezar en la misma página o a mitad de ella, así que cortar
# por páginas mezcla secciones vecinas. Aquí se une el texto de todo el manual
# y se corta exactamente en la línea donde aparece cada título.

def _normalizar_titulo(texto):
    """Quita marcas de negrita, unifica espacios y minúsculas para comparar títulos."""
    return normalizar_espacios((texto or "").replace("*", "")).casefold()


def _unir_paginas(pages_content, primera_pagina, ultima_pagina):
    """
    Une el texto de las páginas indicadas en un solo texto.
    Devuelve el texto y una lista ordenada de (posición de inicio, número de página)
    para saber a qué página pertenece cada posición.
    """
    partes = []
    inicios_pagina = []
    posicion = 0
    for p in range(primera_pagina, ultima_pagina + 1):
        contenido_pagina = (pages_content.get(p) or "").strip()
        if not contenido_pagina:
            continue
        inicios_pagina.append((posicion, p))
        bloque = contenido_pagina + "\n\n"
        partes.append(bloque)
        posicion += len(bloque)
    return "".join(partes), inicios_pagina


def _pagina_de_posicion(posicion, inicios_pagina):
    """Devuelve el número de página que contiene la posición dada del texto unido."""
    claves = [inicio for inicio, _ in inicios_pagina]
    indice = bisect.bisect_right(claves, posicion) - 1
    return inicios_pagina[max(indice, 0)][1]


def _localizar_titulos(entradas, lineas, inicios_pagina):
    """
    Busca cada título del índice como línea completa del texto, en orden,
    empezando después del título anterior encontrado.

    Un título solo se acepta si cae entre su página del índice y la página
    donde empieza la siguiente entrada; así una mención del mismo texto más
    adelante no se confunde con el título. Devuelve una posición por entrada
    (None si no se encontró o no se aceptó) y la lista de incidencias.
    """
    posiciones = []
    incidencias = []
    siguiente_linea = 0

    for k, (_, titulo, pagina_indice) in enumerate(entradas):
        pagina_limite = entradas[k + 1][2] if k + 1 < len(entradas) else None
        objetivo = _normalizar_titulo(titulo)

        encontrada = None
        for idx in range(siguiente_linea, len(lineas)):
            if lineas[idx][1] == objetivo:
                encontrada = idx
                break

        if encontrada is None:
            incidencias.append(
                f"'{titulo}' (página {pagina_indice}): no se encontró como línea completa."
            )
            posiciones.append(None)
            continue

        posicion = lineas[encontrada][0]
        pagina_encontrada = _pagina_de_posicion(posicion, inicios_pagina)
        fuera_de_rango = pagina_encontrada < pagina_indice or (
            pagina_limite is not None and pagina_encontrada > max(pagina_limite, pagina_indice)
        )
        if fuera_de_rango:
            incidencias.append(
                f"'{titulo}' (página {pagina_indice}): solo aparece en la página "
                f"{pagina_encontrada}, fuera de orden; no se cortó ahí."
            )
            posiciones.append(None)
            continue

        posiciones.append(posicion)
        siguiente_linea = encontrada + 1

    return posiciones, incidencias


def _texto_por_paginas(pages_content, pagina_inicio, pagina_fin):
    """Respaldo: texto completo de un rango de páginas (corte anterior por páginas)."""
    texto = ""
    for p in range(pagina_inicio, pagina_fin + 1):
        contenido_pagina = (pages_content.get(p) or "").strip()
        if contenido_pagina:
            texto += contenido_pagina + "\n\n"
    return texto.strip()


def construir_secciones_por_titulos(toc, pages_content, total_pages, pages_full_render=None):
    """
    Arma la lista de secciones cortando el texto del manual en cada título del TOC.

    Cada sección va desde la línea de su título hasta la línea del siguiente
    título encontrado. pagina_inicio y pagina_fin son las páginas reales donde
    empieza y termina ese texto. Si un título no se encuentra (o aparece fuera
    de orden), su texto queda dentro de la sección anterior y esa sección usa
    como respaldo el texto de su página del índice; el caso queda en incidencias.
    """
    pages_full_render = pages_full_render or {}
    entradas = [
        (nivel, titulo.strip(), pagina)
        for nivel, titulo, pagina, *_ in toc
        if pagina >= PRIMERA_PAGINA_CONTENIDO
    ]
    if not entradas:
        return [], []

    texto, inicios_pagina = _unir_paginas(pages_content, entradas[0][2], total_pages)
    lineas = [
        (m.start(), _normalizar_titulo(m.group(0)))
        for m in re.finditer(r"[^\n]+", texto)
    ]

    posiciones, incidencias = _localizar_titulos(entradas, lineas, inicios_pagina)

    encontradas = [p for p in posiciones if p is not None]
    if encontradas and texto[:encontradas[0]].strip():
        incidencias.append(
            "Hay texto antes del primer título encontrado; no pertenece a ninguna sección."
        )

    manual_data = []
    for k, (nivel, titulo, pagina_indice) in enumerate(entradas):
        inicio = posiciones[k]

        if inicio is None:
            # Respaldo: sin título localizable, se usa solo su página del índice
            pagina_inicio = pagina_fin = pagina_indice
            texto_seccion = _texto_por_paginas(pages_content, pagina_inicio, pagina_fin)
        else:
            fin = next((p for p in posiciones[k + 1:] if p is not None), len(texto))
            bruto = texto[inicio:fin]
            texto_seccion = bruto.strip()
            ultimo_caracter = inicio + len(bruto.rstrip()) - 1
            pagina_inicio = _pagina_de_posicion(inicio, inicios_pagina)
            pagina_fin = _pagina_de_posicion(max(ultimo_caracter, inicio), inicios_pagina)

        iconos_seccion = []
        for nombre in IMG_MARKER_PATTERN.findall(texto_seccion):
            if nombre not in iconos_seccion:
                iconos_seccion.append(nombre)

        seccion_info = {
            "id": len(manual_data) + 1,
            "nivel": nivel,
            "titulo": titulo,
            "pagina_inicio": pagina_inicio,
            "pagina_fin": pagina_fin,
            "contenido": texto_seccion,
            "imagenes": iconos_seccion,
        }
        if RENDER_FULL_PAGE:
            seccion_info["capturas_pagina_completa"] = [
                pages_full_render[p]
                for p in range(pagina_inicio, pagina_fin + 1)
                if pages_full_render.get(p)
            ]

        manual_data.append(seccion_info)

    return manual_data, incidencias


def process_pdf_high_performance(pdf_path: str, output_dir: str):
    """
    Orquesta todo el procesamiento del PDF: pre-scan de cabeceras/pies,
    extracción de texto e imágenes por página, mapeo al TOC y escritura
    de manual_structure.json en output_dir.
    """
    print(f"Abriendo documento maestro: {pdf_path}")

    if not os.path.exists(pdf_path):
        print(f"Error: No se encontró el archivo en {pdf_path}")
        return []

    images_dir = os.path.join(output_dir, "extracted_assets")
    os.makedirs(images_dir, exist_ok=True)

    document = fitz.open(pdf_path)
    total_pages = len(document)

    # El script depende completamente del índice digital; sin él no puede armar secciones
    toc = document.get_toc()
    if not toc:
        print("\nADVERTENCIA: El PDF no trae índice digital (get_toc() vino vacío).")
        print("Este script depende 100% de ese índice para armar las secciones.")
        document.close()
        return []

    print(f"Índice digital encontrado: {len(toc)} elementos.")
    print("Pre-scan: detectando cabeceras y pies repetidos...")
    excluded_img_hashes, excluded_text_patterns = _construir_exclusiones(document)

    print("Calibrando interlineado típico del documento...")
    gap_tipico_doc = _calcular_gap_tipico_documento(document)
    if gap_tipico_doc is not None:
        print(f"  Gap típico: {gap_tipico_doc:.2f}pt  "
              f"(umbral fusión: {gap_tipico_doc * 1.4:.2f}pt)")
    else:
        print("  Calibración sin resultado, usando umbral por ratio.")

    print(f"Paso 1: Procesando texto e imágenes de las {total_pages} páginas...")

    zoom_matrix = fitz.Matrix(1.5, 1.5)
    pages_content = {}
    pages_full_render = {}

    for page_num in range(total_pages):
        page = document[page_num]
        p_num = page_num + 1

        pages_content[p_num] = extract_page_content(
            page, page_num, images_dir,
            excluded_img_hashes=excluded_img_hashes,
            excluded_text_patterns=excluded_text_patterns,
            gap_tipico_doc=gap_tipico_doc,
        )

        if RENDER_FULL_PAGE:
            img_filename = f"pagina_{p_num}_visual.png"
            img_path = os.path.join(images_dir, img_filename)
            try:
                pix = page.get_pixmap(matrix=zoom_matrix)
                pix.save(img_path)
                pages_full_render[p_num] = img_filename
            except Exception:
                pages_full_render[p_num] = None

        if p_num % 200 == 0:
            print(f"-> Procesadas {p_num} de {total_pages} páginas...")

    print("Paso 2: Cortando el texto del manual por los títulos del índice digital (TOC)...")
    manual_data, incidencias = construir_secciones_por_titulos(
        toc, pages_content, total_pages, pages_full_render
    )

    if incidencias:
        print(f"\nADVERTENCIA: {len(incidencias)} título(s) con incidencias en el corte:")
        for incidencia in incidencias:
            print(f"  - {incidencia}")

    json_path = os.path.join(output_dir, "manual_structure.json")
    with open(json_path, "w", encoding="utf-8") as json_file:
        json.dump(manual_data, json_file, ensure_ascii=False, indent=4)

    document.close()
    print(f"\n¡Proceso completado!")
    print(f"-> Secciones estructuradas: {len(manual_data)}")
    print(f"-> Archivo JSON maestro: {json_path}")
    print(f"-> Carpeta de recursos gráficos: {images_dir}")
    return manual_data


if __name__ == "__main__":
    PDF_FILE = "../../data/manualcb.pdf"
    DATA_FOLDER = "../../data"

    process_pdf_high_performance(PDF_FILE, DATA_FOLDER)
