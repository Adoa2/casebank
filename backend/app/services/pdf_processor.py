# app/services/pdf_processor.py
import fitz  # PyMuPDF
import os
import re
import json

PRIMERA_PAGINA_CONTENIDO = 9
# Ignora imágenes decorativas
MIN_ICON_SIZE = 15  # px
RENDER_FULL_PAGE = False

# Patrón para encontrar los marcadores [IMG:nombre_archivo.png] insertados
IMG_MARKER_PATTERN = re.compile(r"\[IMG:([^\]]+)\]")

# ---------------------------------------------------------------------------


def extract_page_content(page, page_num, images_dir, min_size=MIN_ICON_SIZE):
    """
    Recorre los bloques de la página en orden de lectura (de arriba hacia
    abajo, izquierda a derecha) y devuelve un único string con el texto de
    la página y marcadores [IMG:nombre_archivo.png] insertados exactamente
    en el punto donde aparecía cada imagen incrustada.

    Esto reemplaza el enfoque anterior (texto e imágenes por separado) para
    poder reconstruir en el frontend la posición real de cada imagen dentro
    del contenido, en vez de agruparlas todas al final de la sección.

    NOTA DE RENDIMIENTO: se usa page.get_text("dict") en vez de
    get_images() + get_image_rects(). Ese segundo método es MUY lento en
    páginas con capturas grandes; get_text("dict") ya trae la posición
    (bbox) y los bytes de la imagen listos para guardar.
    """
    blocks = page.get_text("dict")["blocks"]

    blocks_ordenados = sorted(
        blocks, key=lambda b: (round(b["bbox"][1], 0), b["bbox"][0])
    )

    piezas = []
    idx_icono = 0

    for block in blocks_ordenados:
        if block.get("type") == 0:  # bloque de texto
            lineas = []
            for line in block.get("lines", []):
                texto_linea = ""
                for span in line.get("spans", []):
                    texto_linea += span.get("text", "")
                texto_linea = texto_linea.replace("&nbsp;", " ")
                texto_linea = re.sub(r"\s+", " ", texto_linea).strip()
                if texto_linea:
                    lineas.append(texto_linea)

            if lineas:
                piezas.append(" ".join(lineas))

        elif block.get("type") == 1:  # bloque de imagen
            bbox = block["bbox"]
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            if width < min_size or height < min_size:
                continue  # descarta decoraciones diminutas

            img_bytes = block.get("image")
            ext = block.get("ext", "png")
            if not img_bytes:
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

    return "\n".join(piezas)


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

    pages_content = {}
    pages_full_render = {}

    for page_num in range(total_pages):
        page = document[page_num]
        p_num = page_num + 1

        # Texto + marcadores de imagen intercalados en orden de lectura
        pages_content[p_num] = extract_page_content(page, page_num, images_dir)

        # (Opcional) captura visual de la página completa
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
        capturas_seccion = []

        for p in range(pagina_inicio, pagina_fin + 1):
            if p in pages_content:
                texto_seccion += pages_content[p] + "\n\n"
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