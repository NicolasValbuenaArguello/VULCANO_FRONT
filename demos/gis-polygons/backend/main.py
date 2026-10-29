"""CRUD GIS independiente. Ejecutar en loopback; no incorpora controles operacionales."""
import json
import os
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Literal
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from shapely.geometry import Polygon


class Modelo(BaseModel):
    """Rechaza campos inesperados y numeros no finitos en todo el contrato."""
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


class Vertice(Modelo):
    latitud: float = Field(ge=-90, le=90)
    longitud: float = Field(ge=-180, le=180)


class Estilo(Modelo):
    colorRelleno: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    colorLinea: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    opacidadRelleno: float = Field(ge=0, le=1)
    opacidadLinea: float = Field(ge=0, le=1)
    grosorLinea: float = Field(gt=0, le=64)


class Geometria(Modelo):
    type: Literal['Polygon']
    coordinates: list[list[tuple[float, float]]] = Field(min_length=1, max_length=1)


class Entrada(Modelo):
    """Anillo exterior WGS84, sin huecos; vertices editables abiertos y GeoJSON cerrado."""
    nombre: str = Field(min_length=1, max_length=150)
    descripcion: str = Field(default='', max_length=2000)
    vertices: list[Vertice] = Field(min_length=3, max_length=5000)
    geometria: Geometria
    srid: Literal[4326] = 4326
    estilo: Estilo

    @model_validator(mode='after')
    def validar_geometria(self):
        """Comprueba coherencia exacta de orden lon/lat, cierre y topologia con GEOS/Shapely."""
        puntos = [(v.longitud, v.latitud) for v in self.vertices]
        if len(set(puntos)) != len(puntos):
            raise ValueError('Vertices repetidos.')
        if self.geometria.coordinates[0] != puntos + [puntos[0]]:
            raise ValueError('GeoJSON no coincide con los vertices ordenados o no esta cerrado.')
        if max(p[0] for p in puntos) - min(p[0] for p in puntos) > 180:
            raise ValueError('Divida el poligono en el antimeridiano.')
        poligono = Polygon(puntos)
        if not poligono.is_valid or poligono.area <= 0:
            raise ValueError('Geometria degenerada o autointersectada.')
        return self


class Registro(Entrada):
    id: UUID
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    version: int = Field(ge=1)


class ErrorAlmacenamiento(Exception):
    """No permite reemplazar un archivo que no pudo leerse o validarse."""


class Almacen:
    """Transacciones serializadas por hilo y bloqueo de archivo entre procesos cooperantes."""
    def __init__(self, ruta: Path):
        self.ruta = ruta
        self.lock = RLock()

    @contextmanager
    def transaccion(self):
        """Bloquea archivo lateral estable: el JSON se reemplaza atomicamente sin cambiar este bloqueo."""
        with self.lock:
            try:
                self.ruta.parent.mkdir(parents=True, exist_ok=True)
                with self.ruta.with_suffix('.lock').open('a+b') as bloqueo:
                    bloqueo.seek(0, 2)
                    if bloqueo.tell() == 0:
                        bloqueo.write(b'0'); bloqueo.flush()
                    bloqueo.seek(0)
                    if os.name == 'nt':
                        import msvcrt
                        msvcrt.locking(bloqueo.fileno(), msvcrt.LK_LOCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(bloqueo.fileno(), fcntl.LOCK_EX)
                    try:
                        yield
                    finally:
                        bloqueo.seek(0)
                        if os.name == 'nt':
                            msvcrt.locking(bloqueo.fileno(), msvcrt.LK_UNLCK, 1)
                        else:
                            fcntl.flock(bloqueo.fileno(), fcntl.LOCK_UN)
            except OSError as exc:
                raise ErrorAlmacenamiento from exc

    def leer(self) -> list[Registro]:
        """Retorna registros validados o falla de forma cerrada ante corrupcion; usar dentro de transaccion."""
        try:
            if not self.ruta.exists():
                return []
            valores = json.loads(self.ruta.read_text(encoding='utf-8'))
            if not isinstance(valores, list):
                raise ValueError('Formato incorrecto')
            registros = [Registro.model_validate(v) for v in valores]
            if len({r.id for r in registros}) != len(registros):
                raise ValueError('IDs duplicados')
            return registros
        except (OSError, ValueError) as exc:
            raise ErrorAlmacenamiento from exc

    def escribir(self, registros: list[Registro]):
        """Escribe temporal en el mismo directorio, fsync y os.replace; nunca trunca el archivo vigente."""
        temporal = None
        try:
            with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=self.ruta.parent, delete=False) as salida:
                temporal = Path(salida.name)
                json.dump([r.model_dump(mode='json') for r in registros], salida, ensure_ascii=False, allow_nan=False)
                salida.flush(); os.fsync(salida.fileno())
            os.replace(temporal, self.ruta)
        except (OSError, ValueError) as exc:
            raise ErrorAlmacenamiento from exc
        finally:
            if temporal is not None:
                temporal.unlink(missing_ok=True)


def create_app(ruta: Path | None = None) -> FastAPI:
    """Construye el servicio independiente, sin montar ni alterar el backend principal."""
    app = FastAPI(title='GIS Poligonos Independiente', version='1.0.0')
    almacen = Almacen(ruta or Path(os.environ.get('GIS_POLYGONS_FILE', Path(__file__).parent / 'data/poligonos.json')))

    @app.exception_handler(ErrorAlmacenamiento)
    async def error_archivo(_request, _error):
        return JSONResponse(status_code=500, content={'detail': 'No se pudo acceder al almacen GIS.'})

    def buscar(registros, identificador):
        """Obtiene un registro o genera 404, sin modificar almacenamiento."""
        registro = next((r for r in registros if r.id == identificador), None)
        if registro is None:
            raise HTTPException(404, 'Poligono no encontrado.')
        return registro

    def comprobar_version(registro, if_match):
        """Exige ETag fuerte del registro leido: evita sobrescribir o borrar ediciones de otro cliente."""
        if if_match != f'"{registro.version}"':
            raise HTTPException(409, 'El poligono cambio. Consulte su version actual.')

    @app.get('/api/gis/poligonos', response_model=list[Registro])
    def listar():
        """Lista instantanea consistente bajo bloqueo compartido con los escritores."""
        with almacen.transaccion():
            return almacen.leer()

    @app.get('/api/gis/poligonos/{identificador}', response_model=Registro)
    def consultar(identificador: UUID, response: Response):
        """Consulta por UUID y publica ETag para modificaciones condicionales."""
        with almacen.transaccion():
            registro = buscar(almacen.leer(), identificador)
            response.headers['ETag'] = f'"{registro.version}"'
            return registro

    @app.post('/api/gis/poligonos', response_model=Registro, status_code=201)
    def crear(entrada: Entrada, response: Response):
        """Crea UUID/fechas UTC y persiste sin tocar registros de otros modulos."""
        with almacen.transaccion():
            registros = almacen.leer()
            ahora = datetime.now(timezone.utc)
            registro = Registro(**entrada.model_dump(), id=uuid4(), fecha_creacion=ahora, fecha_actualizacion=ahora, version=1)
            almacen.escribir([*registros, registro])
            response.headers['ETag'] = '"1"'
            return registro

    @app.put('/api/gis/poligonos/{identificador}', response_model=Registro)
    def actualizar(identificador: UUID, entrada: Entrada, response: Response, if_match: str = Header(alias='If-Match')):
        """Actualiza todos los atributos, conserva creacion y aumenta version bajo el mismo bloqueo."""
        with almacen.transaccion():
            registros = almacen.leer(); anterior = buscar(registros, identificador)
            comprobar_version(anterior, if_match)
            registro = Registro(**entrada.model_dump(), id=anterior.id, fecha_creacion=anterior.fecha_creacion,
                                fecha_actualizacion=datetime.now(timezone.utc), version=anterior.version+1)
            almacen.escribir([registro if r.id == identificador else r for r in registros])
            response.headers['ETag'] = f'"{registro.version}"'
            return registro

    @app.delete('/api/gis/poligonos/{identificador}', status_code=204)
    def eliminar(identificador: UUID, if_match: str = Header(alias='If-Match')):
        """Elimina solo si el cliente conserva la version actual; devuelve 204 sin cuerpo."""
        with almacen.transaccion():
            registros = almacen.leer(); comprobar_version(buscar(registros, identificador), if_match)
            almacen.escribir([r for r in registros if r.id != identificador])
            return Response(status_code=204)

    return app


app = create_app()
