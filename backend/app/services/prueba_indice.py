import fitz

# Abrimos el documento
doc = fitz.open("../../data/manualcb.pdf")

# Intentamos extraer el índice digital nativo (Bookmarks)
indice = doc.get_toc()

print(f"\n--- RESULTADO DEL ESCÁNER ---")
print(f"Se encontraron {len(indice)} elementos en el índice digital.")

# Imprimimos los primeros 15 elementos para ver cómo están estructurados
for item in indice[:15]:
    # item es una lista: [Nivel de jerarquía, Título, Número de página]
    print(item)