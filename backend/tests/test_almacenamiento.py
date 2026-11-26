"""
Pruebas de services/almacenamiento.py y de su uso en los routers.

Ejecutar desde backend/ con el venv activo (no usa red ni base de datos):

    python -m unittest discover -s tests -v

- ModoLocal*: guardar, leer, borrar, path traversal, tipos y tamaños inválidos,
  nombres raros, y el servidor de archivos (cabeceras, Range, sin listado).
- ModoSupabase*: con requests simulado, comprueba que las llamadas HTTP a
  Supabase (URL, cabeceras, cuerpo, timeouts) son las mismas que antes.
"""

import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# Los routers importan database/db.py, que exige DATABASE_URL (no se conecta).
os.environ.setdefault("DATABASE_URL", "postgresql://prueba:prueba@127.0.0.1:1/prueba")

import fitz  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from starlette.datastructures import Headers, UploadFile  # noqa: E402

from app import config  # noqa: E402
from app.services import almacenamiento as alm  # noqa: E402
from app.services import archivos_estaticos, heygen_client  # noqa: E402
from app.routers import errors, updates, video_generation  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
HTML = b"<html><script>alert(1)</script></html>"
MP4 = bytes(range(256)) * 40  # 10 240 bytes de contenido conocido
BUCKET_IMG_VIDEO = config.SUPABASE_BUCKET_VIDEOS_IA_IMAGENES
BUCKET_MP4 = config.SUPABASE_BUCKET_VIDEOS_IA


def _pdf_con_texto(texto: str = "Hola actualizacion") -> bytes:
    documento = fitz.open()
    documento.new_page().insert_text((72, 72), texto)
    contenido = documento.tobytes()
    documento.close()
    return contenido


def _upload(contenido: bytes, tipo: str, nombre: str = "archivo") -> UploadFile:
    return UploadFile(file=io.BytesIO(contenido), filename=nombre, headers=Headers({"content-type": tipo}))


class _ConLocal(unittest.TestCase):
    """Base: proveedor local sobre una carpeta temporal nueva en cada prueba."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self._tmp.name) / "archivos"
        self._parches = [
            mock.patch.object(config, "ALMACENAMIENTO_PROVEEDOR", "local"),
            mock.patch.object(config, "ARCHIVOS_DIR", str(self.raiz)),
            mock.patch.object(config, "ARCHIVOS_URL_BASE", "/api/archivos"),
            # Ninguna prueba local debe tocar la red.
            mock.patch("requests.get", side_effect=AssertionError("sin red en modo local")),
            mock.patch("requests.post", side_effect=AssertionError("sin red en modo local")),
            mock.patch("requests.delete", side_effect=AssertionError("sin red en modo local")),
        ]
        for p in self._parches:
            p.start()

    def tearDown(self):
        for p in reversed(self._parches):
            p.stop()
        self._tmp.cleanup()


class ModoLocalOperaciones(_ConLocal):
    def test_subir_leer_borrar(self):
        nombre = alm.generar_nombre("png")
        url = alm.subir(alm.BUCKET_ERRORES, nombre, PNG, "image/png")
        self.assertEqual(url, f"/api/archivos/error-evidencias/{nombre}")
        ruta = self.raiz / "error-evidencias" / nombre
        self.assertEqual(ruta.read_bytes(), PNG)
        self.assertEqual(alm.leer(alm.BUCKET_ERRORES, nombre), PNG)
        self.assertEqual(alm.nombre_desde_url(alm.BUCKET_ERRORES, url), nombre)
        alm.borrar(alm.BUCKET_ERRORES, nombre)
        self.assertFalse(ruta.exists())
        alm.borrar(alm.BUCKET_ERRORES, nombre)  # borrar algo que no existe no falla
        with self.assertRaises(alm.ArchivoNoEncontrado):
            alm.leer(alm.BUCKET_ERRORES, nombre)

    def test_crea_carpetas_al_primer_uso_y_sin_temporales(self):
        self.assertFalse(self.raiz.exists())
        alm.subir(alm.BUCKET_ACTUALIZACIONES, "abc.pdf", b"%PDF-1.4", "application/pdf")
        contenido = os.listdir(self.raiz / "actualizaciones-pdf")
        self.assertEqual(contenido, ["abc.pdf"])  # sin .tmp-* sobrantes

    def test_preparar_crea_los_4_buckets(self):
        alm.preparar_carpetas_locales()
        self.assertEqual(sorted(os.listdir(self.raiz)), sorted(alm.buckets()))
        self.assertEqual(len(alm.buckets()), 4)

    @unittest.skipIf(os.name == "nt", "Los permisos POSIX no aplican en Windows")
    def test_permisos(self):
        alm.subir(alm.BUCKET_ERRORES, "a.png", PNG, "image/png")
        self.assertEqual((self.raiz / "error-evidencias" / "a.png").stat().st_mode & 0o777, 0o640)

    def test_subir_archivo_desde_disco(self):
        origen = Path(self._tmp.name) / "origen.mp4"
        origen.write_bytes(MP4)
        url = alm.subir_archivo(BUCKET_MP4, "trabajo-3-abcdefgh12345678.mp4", origen, "video/mp4")
        self.assertEqual(url, f"/api/archivos/{BUCKET_MP4}/trabajo-3-abcdefgh12345678.mp4")
        self.assertEqual((self.raiz / BUCKET_MP4 / "trabajo-3-abcdefgh12345678.mp4").read_bytes(), MP4)

    def test_no_pisa_un_archivo_existente(self):
        alm.subir(alm.BUCKET_ERRORES, "a.png", PNG, "image/png")
        with self.assertRaises(alm.ErrorAlmacenamiento) as ctx:
            alm.subir(alm.BUCKET_ERRORES, "a.png", JPEG, "image/png")
        self.assertEqual(ctx.exception.estado_http, 409)
        self.assertEqual(alm.leer(alm.BUCKET_ERRORES, "a.png"), PNG)

    def test_fallo_a_mitad_no_deja_archivo(self):
        def escribir_y_fallar(salida):
            salida.write(b"medio")
            raise IOError("disco lleno")

        carpeta = self.raiz / "error-evidencias"
        carpeta.mkdir(parents=True)
        with self.assertRaises(IOError):
            alm._escribir_atomico(carpeta / "x.png", escribir_y_fallar)
        self.assertEqual(os.listdir(carpeta), [])

    def test_falta_archivos_dir(self):
        with mock.patch.object(config, "ARCHIVOS_DIR", None):
            with self.assertRaises(alm.AlmacenamientoNoConfigurado) as ctx:
                alm.subir(alm.BUCKET_ERRORES, "a.png", PNG, "image/png")
        self.assertIn("ARCHIVOS_DIR", str(ctx.exception))
        self.assertEqual(ctx.exception.estado_http, 500)

    def test_proveedor_invalido(self):
        with mock.patch.object(config, "ALMACENAMIENTO_PROVEEDOR", "s3"):
            with self.assertRaises(alm.AlmacenamientoNoConfigurado):
                alm.proveedor()


class ModoLocalSeguridad(_ConLocal):
    NOMBRES_RAROS = [
        "../a.png", "..\\a.png", "a/../../b.png", "/etc/passwd.png", "C:\\x.png", "sub/a.png",
        ".oculto.png", "-a.png", "a.png.php", "a.php", "a.PNG", "a", "a.", ".png", "",
        "a b.png", "a\x00.png", "ñandú.png", "a%2e%2e.png", "a" * 129 + ".png", "a.png/",
        ".tmp-abc.parcial",
    ]

    def test_nombres_raros_rechazados(self):
        for nombre in self.NOMBRES_RAROS:
            with self.subTest(nombre=nombre):
                with self.assertRaises(alm.ArchivoInvalido):
                    alm.subir(alm.BUCKET_ERRORES, nombre, PNG, "image/png")
                with self.assertRaises(alm.ArchivoInvalido):
                    alm.leer(alm.BUCKET_ERRORES, nombre)
                with self.assertRaises(alm.ArchivoInvalido):
                    alm.borrar(alm.BUCKET_ERRORES, nombre)
        # Nada se escribió fuera (ni dentro) de la raíz.
        self.assertFalse(any(Path(self._tmp.name).rglob("*.png")))

    def test_bucket_desconocido_o_con_traversal(self):
        for bucket in ["../", "..", "otro", "error-evidencias/..", ""]:
            with self.subTest(bucket=bucket), self.assertRaises(alm.ArchivoInvalido):
                alm.subir(bucket, "a.png", PNG, "image/png")

    def test_ruta_local_verifica_que_queda_dentro(self):
        with self.assertRaises(alm.ArchivoInvalido):
            alm._ruta_local(alm.BUCKET_ERRORES, "../../fuera.png")
        self.assertEqual(alm._ruta_local(alm.BUCKET_ERRORES, "a.png"), (self.raiz / "error-evidencias" / "a.png").resolve())

    def test_extension_y_tipo_por_bucket(self):
        casos = [
            (alm.BUCKET_ERRORES, "a.pdf", b"%PDF", "application/pdf"),   # pdf en bucket de imágenes
            (alm.BUCKET_ACTUALIZACIONES, "a.png", PNG, "image/png"),     # imagen en bucket de pdf
            (alm.BUCKET_ERRORES, "a.png", PNG, "text/html"),             # tipo no coincide
            (alm.BUCKET_ERRORES, "a.png", PNG, "image/jpeg"),            # tipo de otra extensión
            (BUCKET_MP4, "a.webm", b"x", "video/webm"),
        ]
        for bucket, nombre, contenido, tipo in casos:
            with self.subTest(bucket=bucket, nombre=nombre, tipo=tipo), self.assertRaises(alm.ArchivoInvalido):
                alm.subir(bucket, nombre, contenido, tipo)

    def test_limites_de_tamano(self):
        limites = {alm.BUCKET_ERRORES: 5, alm.BUCKET_ACTUALIZACIONES: 15, BUCKET_IMG_VIDEO: 5, BUCKET_MP4: 500}
        for bucket, mb in limites.items():
            with self.subTest(bucket=bucket):
                self.assertEqual(alm._reglas()[bucket].max_bytes, mb * 1024 * 1024)
        with self.assertRaises(alm.ArchivoInvalido):
            alm.subir(alm.BUCKET_ACTUALIZACIONES, "a.pdf", b"0" * (15 * 1024 * 1024 + 1), "application/pdf")
        alm.subir(alm.BUCKET_ACTUALIZACIONES, "a.pdf", b"0" * (15 * 1024 * 1024), "application/pdf")

    def test_validar_imagen_por_firma(self):
        self.assertEqual(alm.validar_imagen(PNG, "image/png"), ("png", "image/png"))
        self.assertEqual(alm.validar_imagen(JPEG, "image/jpg"), ("jpg", "image/jpeg"))
        # JPEG declarado como PNG: manda la firma real.
        self.assertEqual(alm.validar_imagen(JPEG, "image/png"), ("jpg", "image/jpeg"))
        for contenido, tipo in [(HTML, "image/png"), (b"", "image/png"), (b"GIF89a", "image/png"),
                                (PNG, "image/gif"), (PNG, None), (PNG, "text/html")]:
            with self.subTest(tipo=tipo, inicio=contenido[:6]), self.assertRaises(alm.ArchivoInvalido):
                alm.validar_imagen(contenido, tipo)
        with self.assertRaises(alm.ArchivoInvalido):
            alm.validar_imagen(PNG + b"0" * (5 * 1024 * 1024), "image/png")

    def test_nombre_desde_url(self):
        b = alm.BUCKET_ERRORES
        self.assertEqual(alm.nombre_desde_url(b, "/api/archivos/error-evidencias/abc.png"), "abc.png")
        for url in [None, "", "https://evil.test/api/archivos/error-evidencias/abc.png",
                    "https://x.supabase.co/storage/v1/object/public/error-evidencias/abc.png",
                    "/api/archivos/error-evidencias/../../config.py", "/api/archivos/error-evidencias/sub/a.png",
                    "/api/archivos/actualizaciones-pdf/abc.pdf", "/api/archivos/error-evidencias/"]:
            with self.subTest(url=url):
                self.assertIsNone(alm.nombre_desde_url(b, url))


class ModoLocalServidorArchivos(_ConLocal):
    def setUp(self):
        super().setUp()
        app = FastAPI()
        archivos_estaticos.montar_archivos_locales(app)
        self.cliente = TestClient(app)
        alm.subir(alm.BUCKET_ERRORES, "img.png", PNG, "image/png")
        alm.subir(alm.BUCKET_ACTUALIZACIONES, "doc.pdf", b"%PDF-1.4 prueba", "application/pdf")
        alm.subir(BUCKET_MP4, "trabajo-1-abcdefgh12345678.mp4", MP4, "video/mp4")
        (self.raiz / "error-evidencias" / ".tmp-x.parcial").write_bytes(b"temporal")
        (self.raiz / "secreto.txt").write_text("no")

    def test_imagen_con_nosniff_y_sandbox(self):
        r = self.cliente.get("/api/archivos/error-evidencias/img.png")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.content, PNG)
        self.assertEqual(r.headers["content-type"], "image/png")
        self.assertEqual(r.headers["x-content-type-options"], "nosniff")
        self.assertEqual(r.headers["content-security-policy"], "sandbox")

    def test_pdf_con_nosniff_sin_sandbox(self):
        r = self.cliente.get("/api/archivos/actualizaciones-pdf/doc.pdf")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["content-type"], "application/pdf")
        self.assertEqual(r.headers["x-content-type-options"], "nosniff")
        self.assertNotIn("content-security-policy", r.headers)

    def test_mp4_admite_range(self):
        url = f"/api/archivos/{BUCKET_MP4}/trabajo-1-abcdefgh12345678.mp4"
        completo = self.cliente.get(url)
        self.assertEqual(completo.headers["accept-ranges"], "bytes")
        self.assertEqual(completo.headers["content-type"], "video/mp4")
        self.assertEqual(completo.headers["content-security-policy"], "sandbox")
        r = self.cliente.get(url, headers={"Range": "bytes=1000-1099"})
        self.assertEqual(r.status_code, 206)
        self.assertEqual(r.headers["content-range"], f"bytes 1000-1099/{len(MP4)}")
        self.assertEqual(r.content, MP4[1000:1100])
        self.assertEqual(r.headers["x-content-type-options"], "nosniff")
        final = self.cliente.get(url, headers={"Range": "bytes=-16"})
        self.assertEqual(final.status_code, 206)
        self.assertEqual(final.content, MP4[-16:])
        fuera = self.cliente.get(url, headers={"Range": f"bytes={len(MP4) + 10}-"})
        self.assertEqual(fuera.status_code, 416)
        self.assertEqual(self.cliente.head(url).status_code, 200)

    def test_sin_listado_ni_rutas_fuera(self):
        for ruta in ["/api/archivos/", "/api/archivos/error-evidencias/", "/api/archivos/error-evidencias",
                     "/api/archivos/secreto.txt", "/api/archivos/error-evidencias/.tmp-x.parcial",
                     "/api/archivos/error-evidencias/../secreto.txt", "/api/archivos/..%2fsecreto.txt",
                     "/api/archivos/error-evidencias/%2e%2e/%2e%2e/config.py", "/api/archivos/otro/img.png",
                     "/api/archivos/error-evidencias/no-existe.png"]:
            with self.subTest(ruta=ruta):
                self.assertEqual(self.cliente.get(ruta).status_code, 404)

    def test_solo_lectura(self):
        r = self.cliente.post("/api/archivos/error-evidencias/img.png", content=b"x")
        self.assertEqual(r.status_code, 405)


class ModoLocalRouters(_ConLocal):
    def test_subida_de_evidencia(self):
        respuesta = errors.subir_imagen_evidencia(file=_upload(PNG, "image/png", "../../x.png"), current_user=None)
        nombre = respuesta["url"].rsplit("/", 1)[1]
        self.assertTrue(respuesta["url"].startswith("/api/archivos/error-evidencias/"))
        self.assertRegex(nombre, r"^[0-9a-f]{32}\.png$")  # el nombre del cliente se ignora
        with self.assertRaises(HTTPException) as ctx:
            errors.subir_imagen_evidencia(file=_upload(HTML, "image/png"), current_user=None)
        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException) as ctx:
            errors.subir_imagen_evidencia(file=_upload(PNG + b"0" * (5 * 1024 * 1024), "image/png"), current_user=None)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("5 MB", ctx.exception.detail)

    def test_captura_de_video(self):
        respuesta = video_generation.subir_imagen(file=_upload(JPEG, "image/jpeg"), current_user=None)
        self.assertRegex(respuesta["url"], rf"^/api/archivos/{BUCKET_IMG_VIDEO}/[0-9a-f]{{32}}\.jpg$")

    def test_pdf_subir_releer_y_borrar(self):
        pdf = _pdf_con_texto("Texto de prueba del PDF")
        ruta, url = updates._upload_pdf(pdf)
        self.assertEqual(url, f"/api/archivos/actualizaciones-pdf/{ruta}")
        documento = mock.Mock(ruta_almacenamiento=ruta, archivo_url=url, archivo_nombre="a.pdf")
        paginas = updates._load_pages_from_storage(documento)  # lee del disco, sin HTTP
        self.assertIn("Texto de prueba", paginas[0]["text"])
        updates._delete_pdf(ruta)
        self.assertFalse((self.raiz / "actualizaciones-pdf" / ruta).exists())
        updates._delete_pdf("../../x.pdf")  # best-effort: nombre inválido no lanza

    def test_validar_pasos(self):
        url = video_generation.subir_imagen(file=_upload(PNG, "image/png"), current_user=None)["url"]
        Paso = video_generation.PasoEntrada
        video_generation.validar_pasos([Paso(texto="Paso uno", imagen_url=url)])
        for mala in [f"https://x.supabase.co/storage/v1/object/public/{BUCKET_IMG_VIDEO}/a.png",
                     "/api/archivos/error-evidencias/a.png", "https://evil.test/a.png"]:
            with self.subTest(url=mala), self.assertRaises(HTTPException):
                video_generation.validar_pasos([Paso(texto="Paso uno", imagen_url=mala)])

    def test_heygen_lee_capturas_del_disco(self):
        url = video_generation.subir_imagen(file=_upload(PNG, "image/png"), current_user=None)["url"]
        self.assertEqual(heygen_client._descargar_imagen(url), (PNG, "image/png"))
        with self.assertRaises(ValueError):
            heygen_client._descargar_imagen("https://evil.test/a.png")
        with self.assertRaises(ValueError):
            heygen_client._descargar_imagen(f"/api/archivos/{BUCKET_IMG_VIDEO}/../../secreto.png")

    def test_copiar_video_y_eliminarlo(self):
        respuesta = mock.MagicMock()
        respuesta.__enter__.return_value = respuesta
        respuesta.iter_content.return_value = [MP4[:5000], MP4[5000:]]
        with mock.patch("app.routers.video_generation.requests.get", return_value=respuesta) as get:
            url = video_generation._copiar_video_a_storage("https://heygen.test/v.mp4", "trabajo-9-abcdefgh12345678.mp4")
        get.assert_called_once()
        self.assertEqual(url, f"/api/archivos/{BUCKET_MP4}/trabajo-9-abcdefgh12345678.mp4")
        self.assertEqual((self.raiz / BUCKET_MP4 / "trabajo-9-abcdefgh12345678.mp4").read_bytes(), MP4)
        video_generation._eliminar_de_storage(BUCKET_MP4, url)
        self.assertFalse((self.raiz / BUCKET_MP4 / "trabajo-9-abcdefgh12345678.mp4").exists())
        video_generation._eliminar_de_storage(BUCKET_MP4, "https://www.youtube.com/watch?v=x")  # no lanza


# --- Modo supabase: las llamadas HTTP deben ser las de antes ---

SUPA = "https://proyecto.supabase.co"
CLAVE = "clave-servicio-de-prueba"
AUTH = {"Authorization": f"Bearer {CLAVE}", "apikey": CLAVE}


def _resp(estado=200, texto="{}", contenido=b""):
    r = mock.Mock(status_code=estado, text=texto, content=contenido, headers={})
    return r


class _ConSupabase(unittest.TestCase):
    proveedor = "supabase"

    def setUp(self):
        self._parches = [
            mock.patch.object(config, "ALMACENAMIENTO_PROVEEDOR", self.proveedor),
            mock.patch.object(config, "SUPABASE_URL", SUPA),
            mock.patch.object(config, "SUPABASE_SERVICE_KEY", CLAVE),
            mock.patch.object(config, "ARCHIVOS_DIR", None),
        ]
        for p in self._parches:
            p.start()
        self.post = mock.patch("app.services.almacenamiento.requests.post", return_value=_resp(200)).start()
        self.get = mock.patch("app.services.almacenamiento.requests.get").start()
        self.delete = mock.patch("app.services.almacenamiento.requests.delete", return_value=_resp(200)).start()

    def tearDown(self):
        mock.patch.stopall()
        for p in reversed(self._parches):
            p.stop()


class ModoSupabaseSinCambios(_ConSupabase):
    def test_sin_variable_el_proveedor_es_supabase(self):
        import importlib
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ALMACENAMIENTO_PROVEEDOR", None)
            os.environ.pop("ARCHIVOS_URL_BASE", None)
            with mock.patch("dotenv.load_dotenv"):
                recargado = importlib.reload(config)
            self.assertEqual(recargado.ALMACENAMIENTO_PROVEEDOR, "supabase")
            self.assertEqual(recargado.ARCHIVOS_URL_BASE, "/api/archivos")
        importlib.reload(config)  # restaura los valores del entorno real

    def test_no_se_monta_servidor_de_archivos(self):
        app = FastAPI()
        archivos_estaticos.montar_archivos_locales(app)
        self.assertEqual([r for r in app.routes if getattr(r, "name", "") == "archivos"], [])

    def test_evidencia_de_error(self):
        respuesta = errors.subir_imagen_evidencia(file=_upload(PNG, "image/png"), current_user=None)
        (url,), kwargs = self.post.call_args
        nombre = url.rsplit("/", 1)[1]
        self.assertRegex(nombre, r"^[0-9a-f]{32}\.png$")
        self.assertEqual(url, f"{SUPA}/storage/v1/object/error-evidencias/{nombre}")
        self.assertEqual(kwargs["headers"], {**AUTH, "Content-Type": "image/png"})
        self.assertEqual(kwargs["data"], PNG)
        self.assertEqual(respuesta["url"], f"{SUPA}/storage/v1/object/public/error-evidencias/{nombre}")

    def test_evidencia_error_de_supabase_es_502(self):
        self.post.return_value = _resp(400, '{"error":"Payload too large"}')
        with self.assertRaises(HTTPException) as ctx:
            errors.subir_imagen_evidencia(file=_upload(PNG, "image/png"), current_user=None)
        self.assertEqual(ctx.exception.status_code, 502)
        self.assertIn("Payload too large", ctx.exception.detail)

    def test_sin_credenciales_es_500(self):
        with mock.patch.object(config, "SUPABASE_SERVICE_KEY", None):
            with self.assertRaises(HTTPException) as ctx:
                errors.subir_imagen_evidencia(file=_upload(PNG, "image/png"), current_user=None)
        self.assertEqual(ctx.exception.status_code, 500)
        self.post.assert_not_called()

    def test_pdf_subida_y_borrado(self):
        pdf = _pdf_con_texto()
        ruta, url = updates._upload_pdf(pdf)
        (url_post,), kwargs = self.post.call_args
        self.assertEqual(url_post, f"{SUPA}/storage/v1/object/actualizaciones-pdf/{ruta}")
        self.assertEqual(kwargs["headers"], {**AUTH, "Content-Type": "application/pdf"})
        self.assertEqual(kwargs["timeout"], 45)
        self.assertEqual(url, f"{SUPA}/storage/v1/object/public/actualizaciones-pdf/{ruta}")
        updates._delete_pdf(ruta)
        self.delete.assert_called_once_with(
            f"{SUPA}/storage/v1/object/actualizaciones-pdf/{ruta}", headers=AUTH, timeout=20
        )

    def test_pdf_crea_bucket_si_no_existe_y_reintenta(self):
        self.post.side_effect = [_resp(404, '{"message":"Bucket not found"}'), _resp(200), _resp(200)]
        ruta, _ = updates._upload_pdf(_pdf_con_texto())
        llamadas = self.post.call_args_list
        self.assertEqual(len(llamadas), 3)
        self.assertEqual(llamadas[1].args[0], f"{SUPA}/storage/v1/bucket")
        self.assertEqual(llamadas[1].kwargs["json"], {
            "id": "actualizaciones-pdf", "name": "actualizaciones-pdf", "public": True,
            "file_size_limit": 15 * 1024 * 1024, "allowed_mime_types": ["application/pdf"],
        })
        self.assertEqual(llamadas[2].args[0], f"{SUPA}/storage/v1/object/actualizaciones-pdf/{ruta}")

    def test_imagenes_no_crean_bucket(self):
        self.post.return_value = _resp(404, '{"message":"Bucket not found"}')
        with self.assertRaises(HTTPException):
            errors.subir_imagen_evidencia(file=_upload(PNG, "image/png"), current_user=None)
        self.assertEqual(self.post.call_count, 1)

    def test_pdf_releer_descarga_la_url_publica(self):
        pdf = _pdf_con_texto("Contenido remoto")
        self.get.return_value = _resp(200, contenido=pdf)
        documento = mock.Mock(ruta_almacenamiento="abc.pdf", archivo_nombre="a.pdf")
        paginas = updates._load_pages_from_storage(documento)
        self.get.assert_called_once_with(f"{SUPA}/storage/v1/object/public/actualizaciones-pdf/abc.pdf", timeout=45)
        self.assertIn("Contenido remoto", paginas[0]["text"])

    def test_captura_de_video(self):
        respuesta = video_generation.subir_imagen(file=_upload(JPEG, "image/jpeg"), current_user=None)
        (url,), kwargs = self.post.call_args
        nombre = url.rsplit("/", 1)[1]
        self.assertEqual(url, f"{SUPA}/storage/v1/object/{BUCKET_IMG_VIDEO}/{nombre}")
        self.assertEqual(kwargs["headers"], {**AUTH, "Content-Type": "image/jpeg"})
        self.assertEqual(kwargs["timeout"], 30)
        self.assertEqual(respuesta["url"], f"{SUPA}/storage/v1/object/public/{BUCKET_IMG_VIDEO}/{nombre}")

    def test_validar_pasos_con_prefijo_supabase(self):
        Paso = video_generation.PasoEntrada
        buena = f"{SUPA}/storage/v1/object/public/{BUCKET_IMG_VIDEO}/{'a' * 32}.png"
        video_generation.validar_pasos([Paso(texto="Paso", imagen_url=buena)])
        with self.assertRaises(HTTPException):
            video_generation.validar_pasos([Paso(texto="Paso", imagen_url="https://evil.test/a.png")])
        with mock.patch.object(config, "SUPABASE_URL", None):  # como antes: sin SUPABASE_URL no se valida
            video_generation.validar_pasos([Paso(texto="Paso", imagen_url="https://cualquiera.test/a.png")])

    def test_heygen_descarga_solo_del_bucket(self):
        url = f"{SUPA}/storage/v1/object/public/{BUCKET_IMG_VIDEO}/{'b' * 32}.jpg"
        self.get.return_value = _resp(200, contenido=JPEG)
        self.assertEqual(heygen_client._descargar_imagen(url), (JPEG, "image/jpeg"))
        self.get.assert_called_once_with(url, timeout=heygen_client.TIMEOUT_DESCARGA)
        self.get.reset_mock()
        for mala in ["https://evil.test/a.png", f"{SUPA}/storage/v1/object/public/error-evidencias/a.png",
                     f"/api/archivos/{BUCKET_IMG_VIDEO}/a.png"]:
            with self.subTest(url=mala), self.assertRaises(ValueError):
                heygen_client._descargar_imagen(mala)
        self.get.assert_not_called()

    def test_copiar_video_y_eliminar(self):
        origen = mock.MagicMock()
        origen.__enter__.return_value = origen
        origen.iter_content.return_value = [MP4]
        enviado = {}

        def post(url, headers, data, timeout):
            enviado.update(url=url, headers=headers, data=data.read(), timeout=timeout)
            return _resp(200)

        self.post.side_effect = post
        with mock.patch("app.routers.video_generation.requests.get", return_value=origen):
            url = video_generation._copiar_video_a_storage("https://heygen.test/v.mp4", "trabajo-5-abcdefgh12345678.mp4")
        self.assertEqual(enviado["url"], f"{SUPA}/storage/v1/object/{BUCKET_MP4}/trabajo-5-abcdefgh12345678.mp4")
        self.assertEqual(enviado["headers"], {**AUTH, "Content-Type": "video/mp4", "Content-Length": str(len(MP4))})
        self.assertEqual(enviado["data"], MP4)
        self.assertEqual(enviado["timeout"][0], 10)
        self.assertEqual(url, f"{SUPA}/storage/v1/object/public/{BUCKET_MP4}/trabajo-5-abcdefgh12345678.mp4")
        video_generation._eliminar_de_storage(BUCKET_MP4, url)
        self.delete.assert_called_once_with(
            f"{SUPA}/storage/v1/object/{BUCKET_MP4}/trabajo-5-abcdefgh12345678.mp4", headers=AUTH, timeout=20
        )

    def test_copiar_video_sin_configuracion_falla_antes_de_descargar(self):
        with mock.patch.object(config, "SUPABASE_URL", None), \
                mock.patch("app.routers.video_generation.requests.get") as get:
            with self.assertRaises(RuntimeError):
                video_generation._copiar_video_a_storage("https://heygen.test/v.mp4", "trabajo-5-abcdefgh12345678.mp4")
        get.assert_not_called()


class ScriptMigracionArchivos(unittest.TestCase):
    """migrar_archivos_supabase_a_local.py con Supabase simulado: dry-run, descarga y reanudación."""

    def setUp(self):
        import importlib.util
        ruta = Path(__file__).resolve().parents[1] / "scripts" / "migrar_archivos_supabase_a_local.py"
        spec = importlib.util.spec_from_file_location("migrar_archivos", ruta)
        self.script = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.script)
        self._tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self._tmp.name) / "archivos"
        for p in [mock.patch.object(config, "SUPABASE_URL", SUPA), mock.patch.object(config, "SUPABASE_SERVICE_KEY", CLAVE),
                  mock.patch.object(config, "ARCHIVOS_DIR", str(self.raiz)),
                  mock.patch.object(config, "ALMACENAMIENTO_PROVEEDOR", "supabase")]:
            p.start()
            self.addCleanup(p.stop)
        self.addCleanup(self._tmp.cleanup)
        self.objetos = {
            "error-evidencias": [("a" * 32 + ".png", PNG), ("../malo.png", PNG)],
            BUCKET_MP4: [("trabajo-1-abcdefgh12345678.mp4", MP4)],
        }

    def _post(self, url, headers, json, timeout):
        bucket = url.rsplit("/", 1)[1]
        items = [{"name": n, "id": "x", "metadata": {"size": len(c)}} for n, c in self.objetos.get(bucket, [])]
        return mock.Mock(status_code=200, json=lambda: items[json["offset"]:json["offset"] + json["limit"]])

    def _get(self, url, headers, stream, timeout):
        bucket, nombre = url.split("/storage/v1/object/", 1)[1].split("/", 1)
        contenido = dict(self.objetos[bucket])[nombre]
        r = mock.MagicMock(status_code=200)
        r.__enter__.return_value = r
        r.iter_content.return_value = [contenido]
        return r

    def _ejecutar(self, *args):
        salida = io.StringIO()
        with mock.patch.object(sys, "argv", ["migrar", *args]), \
                mock.patch.object(self.script.requests, "post", side_effect=self._post), \
                mock.patch.object(self.script.requests, "get", side_effect=self._get) as get, \
                mock.patch("sys.stdout", salida):
            codigo = self.script.main()
        return codigo, salida.getvalue(), get.call_count

    def test_dry_run_no_escribe(self):
        codigo, salida, descargas = self._ejecutar("--dry-run")
        self.assertEqual((codigo, descargas), (0, 0))
        self.assertFalse(self.raiz.exists())
        self.assertIn("2 por descargar", salida)
        self.assertIn("1 omitidos", salida)  # ../malo.png

    def test_descarga_y_reanuda(self):
        codigo, salida, descargas = self._ejecutar()
        self.assertEqual((codigo, descargas), (0, 2))
        self.assertEqual((self.raiz / "error-evidencias" / ("a" * 32 + ".png")).read_bytes(), PNG)
        self.assertEqual((self.raiz / BUCKET_MP4 / "trabajo-1-abcdefgh12345678.mp4").read_bytes(), MP4)
        self.assertFalse((Path(self._tmp.name) / "malo.png").exists())
        codigo, salida, descargas = self._ejecutar()
        self.assertEqual((codigo, descargas), (0, 0))
        self.assertIn("2 ya existían", salida)


if __name__ == "__main__":
    unittest.main()
