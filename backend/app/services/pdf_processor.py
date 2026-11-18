# app/services/pdf_processor.py
import fitz  # PyMuPDF
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
                digest = hashlib.md5(img_bytes).hexdigest()
                img_zones[digest].append(zone)

            elif block.get("type") == 0 and zone != "body":
                raw = " ".join(
                    span.get("text", "")
                    for line in block.get("lines", [])
                    for span in line.get("spans", [])
                ).strip()
                if raw:
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
                with open(filepath, "wb") as f:
                    f.write(img_bytes)
                piezas.append(f"[IMG:{filename}]")
                idx_icono += 1
            except Exception as e:
                print(f"No se pudo guardar imagen en página {page_num + 1}: {e}")

            ultimo_bloque_texto = None

    return "\n\n".join(piezas)


def process_pdf_high_performance(pdf_path: str, output_dir: str):
    print(f"Abriendo documento maestro: {pdf_path}")

    if not os.path.exists(pdf_path):
        print(f"Error: No se encontró el archivo en {pdf_path}")
        return []

    images_dir = os.path.join(output_dir, "extracted_assets")
    os.makedirs(images_dir, exist_ok=True)

    document = fitz.open(pdf_path)
    total_pages = len(document)

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

    print("Paso 2: Mapeando secciones con el índice digital (TOC)...")
    manual_data = []

    for i in range(len(toc)):
        nivel = toc[i][0]
        titulo = toc[i][1]
        pagina_inicio = toc[i][2]

        if pagina_inicio < PRIMERA_PAGINA_CONTENIDO:
            continue

        pagina_fin = total_pages
        for j in range(i + 1, len(toc)):
            if toc[j][2] > pagina_inicio:
                pagina_fin = toc[j][2] - 1
                break

        if pagina_fin < pagina_inicio:
            pagina_fin = pagina_inicio

        texto_seccion = ""
        capturas_seccion = []

        for p in range(pagina_inicio, pagina_fin + 1):
            if p in pages_content:
                contenido_pagina = pages_content[p].strip()
                if contenido_pagina:
                    texto_seccion += contenido_pagina + "\n\n"
            if RENDER_FULL_PAGE and pages_full_render.get(p):
                capturas_seccion.append(pages_full_render[p])

        texto_seccion = texto_seccion.strip()

        iconos_seccion = []
        for nombre in IMG_MARKER_PATTERN.findall(texto_seccion):
            if nombre not in iconos_seccion:
                iconos_seccion.append(nombre)

        seccion_info = {
            "id": len(manual_data) + 1,
            "nivel": nivel,
            "titulo": titulo.strip(),
            "pagina_inicio": pagina_inicio,
            "pagina_fin": pagina_fin,
            "contenido": texto_seccion,
            "imagenes": iconos_seccion,
        }
        if RENDER_FULL_PAGE:
            seccion_info["capturas_pagina_completa"] = capturas_seccion

        manual_data.append(seccion_info)

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
