# app/services/pdf_processor.py
import fitz  # PyMuPDF
import os
import json

# --- AJUSTA ESTO ANTES DE CORRER SOBRE LAS 1000 PÁGINAS -------------------

# Verifica este número con la salida de prueba_indice.py: es la primera
# página real de CONTENIDO (después de portada + índice general).
PRIMERA_PAGINA_CONTENIDO = 9

# Ignora imágenes decorativas microscópicas (líneas, separadores de 1-2px).
# Los íconos reales de tu manual (como los de tu imagen de referencia) son
# bastante más grandes que esto, así que no deberían filtrarse por error.
MIN_ICON_SIZE = 15  # px

# Si además quieres una captura visual de la página completa (útil como
# respaldo para páginas con tablas/diseño complejo), pon esto en True.
# Por defecto apagado: los iconos/capturas ya se extraen individualmente
# más abajo, así que esto normalmente sería redundante.
RENDER_FULL_PAGE = False

# ---------------------------------------------------------------------------


def extract_page_icons(page, page_num, images_dir, min_size=MIN_ICON_SIZE):
    """
    Extrae las imágenes INCRUSTADAS reales de la página (iconos, capturas
    de pantalla embebidas), no una foto de la página completa. Filtra
    imágenes microscópicas que son solo ruido decorativo.

    NOTA DE RENDIMIENTO: esto usa page.get_text("dict") en vez de
    get_images() + get_image_rects(). Ese segundo método es MUY lento
    (recompone un pixmap y calcula un MD5 por cada imagen para ubicarla),
    y con páginas que tienen capturas de pantalla grandes puede tardar
    minutos por página. get_text("dict") ya trae la posición (bbox) y
    los bytes de la imagen listos para guardar, sin ese costo extra.
    """
    icon_filenames = []
    blocks = page.get_text("dict")["blocks"]
    idx = 0

    for block in blocks:
        if block.get("type") != 1:  # 1 = bloque de imagen
            continue

        bbox = block["bbox"]
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        if width < min_size or height < min_size:
            continue  # descarta ruiditos/decoraciones diminutas

        img_bytes = block.get("image")
        ext = block.get("ext", "png")
        if not img_bytes:
            continue

        try:
            filename = f"pagina_{page_num + 1}_icono_{idx}.{ext}"
            filepath = os.path.join(images_dir, filename)
            with open(filepath, "wb") as f:
                f.write(img_bytes)
            icon_filenames.append(filename)
            idx += 1
        except Exception as e:
            print(f"No se pudo guardar imagen en página {page_num + 1}: {e}")

    return icon_filenames


def process_pdf_high_performance(pdf_path: str, output_dir: str):
    print(f"Abriendo documento maestro: {pdf_path}")

    if not os.path.exists(pdf_path):
        print(f"Error: No se encontró el archivo en {pdf_path}")
        return []

    images_dir = os.path.join(output_dir, "extracted_assets")
    os.makedirs(images_dir, exist_ok=True)

    document = fitz.open(pdf_path)
    total_pages = len(document)

    # --- Validación temprana: sin TOC, este enfoque no funciona ------------
    toc = document.get_toc()
    if not toc:
        print("\nADVERTENCIA: El PDF no trae índice digital (get_toc() vino vacío).")
        print("Este script depende 100% de ese índice para armar las secciones.")
        print("Corre prueba_indice.py para confirmarlo. Si efectivamente viene vacío,")
        print("necesitamos otra estrategia (detección de encabezados por tamaño de fuente)")
        print("en vez de get_toc(). Avísame y la armamos.")
        document.close()
        return []

    print(f"Índice digital encontrado: {len(toc)} elementos.")
    print(f"Paso 1: Procesando texto e imágenes de las {total_pages} páginas...")

    zoom_matrix = fitz.Matrix(1.5, 1.5)

    pages_text = {}
    pages_icons = {}
    pages_full_render = {}

    for page_num in range(total_pages):
        page = document[page_num]
        p_num = page_num + 1

        # 1. Texto plano de la página
        pages_text[p_num] = page.get_text()

        # 2. Iconos/imágenes incrustadas reales (no captura de página completa)
        pages_icons[p_num] = extract_page_icons(page, page_num, images_dir)

        # 3. (Opcional) captura visual de la página completa
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
        pagina_inicio = toc[i][2]  # Página real (1-based)

        # Omitir portada e índice general
        if pagina_inicio < PRIMERA_PAGINA_CONTENIDO:
            continue

        # Encontrar dónde termina la sección actual
        pagina_fin = total_pages
        for j in range(i + 1, len(toc)):
            if toc[j][2] > pagina_inicio:
                pagina_fin = toc[j][2] - 1
                break

        if pagina_fin < pagina_inicio:
            pagina_fin = pagina_inicio

        texto_seccion = ""
        iconos_seccion = []
        capturas_seccion = []

        for p in range(pagina_inicio, pagina_fin + 1):
            if p in pages_text:
                texto_seccion += pages_text[p] + "\n"
            if p in pages_icons:
                for icono in pages_icons[p]:
                    if icono not in iconos_seccion:
                        iconos_seccion.append(icono)
            if RENDER_FULL_PAGE and pages_full_render.get(p):
                capturas_seccion.append(pages_full_render[p])

        seccion_info = {
            "id": len(manual_data) + 1,
            "nivel": nivel,
            "titulo": titulo.strip(),
            "pagina_inicio": pagina_inicio,
            "pagina_fin": pagina_fin,
            "contenido": texto_seccion.strip(),
            "imagenes": iconos_seccion,
        }
        if RENDER_FULL_PAGE:
            seccion_info["capturas_pagina_completa"] = capturas_seccion

        manual_data.append(seccion_info)

    # 3. Guardar el archivo JSON Maestro final
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