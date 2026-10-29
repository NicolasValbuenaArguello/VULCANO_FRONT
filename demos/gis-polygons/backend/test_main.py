"""Pruebas CRUD, validacion, concurrencia y durabilidad con archivos temporales aislados."""
import tempfile
import unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import create_app


def entrada():
    return {'nombre':'Poligono de prueba','descripcion':'GIS general',
            'vertices':[{'latitud':0,'longitud':0},{'latitud':0,'longitud':1},{'latitud':1,'longitud':0}],
            'geometria':{'type':'Polygon','coordinates':[[[0,0],[1,0],[0,1],[0,0]]]},'srid':4326,
            'estilo':{'colorRelleno':'#3498db','colorLinea':'#ffffff','opacidadRelleno':0.65,'opacidadLinea':1,'grosorLinea':2.5}}


class GisTests(unittest.TestCase):
    def setUp(self):
        base=Path(__file__).resolve().parents[3]/'.tmp/gis-tests'
        base.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=base)
        assert Path(self.temp.name).resolve().is_relative_to(base.resolve())
        self.addCleanup(self.temp.cleanup)
        self.ruta=Path(self.temp.name)/'poligonos.json'
        self.client=TestClient(create_app(self.ruta));self.addCleanup(self.client.close)
        self.base='/api/gis/poligonos'

    def test_crud_y_reapertura(self):
        respuesta=self.client.post(self.base,json=entrada());self.assertEqual(respuesta.status_code,201)
        registro=respuesta.json();url=self.base+'/'+registro['id']
        self.assertEqual(respuesta.headers['etag'],'"1"')
        with TestClient(create_app(self.ruta)) as reiniciado:
            self.assertEqual(reiniciado.get(url).json(),registro)
        valor=entrada();valor['nombre']='Editado';valor['estilo']['grosorLinea']=4
        editado=self.client.put(url,json=valor,headers={'If-Match':'"1"'})
        self.assertEqual(editado.status_code,200)
        self.assertEqual(editado.json()['version'],2)
        self.assertEqual(editado.json()['fecha_creacion'],registro['fecha_creacion'])
        self.assertEqual(editado.json()['estilo']['grosorLinea'],4)
        self.assertEqual(self.client.delete(url,headers={'If-Match':'"2"'}).status_code,204)
        self.assertEqual(self.client.get(url).status_code,404)
        with TestClient(create_app(self.ruta)) as reiniciado:
            self.assertEqual(reiniciado.get(self.base).json(),[])

    def test_geometrias_invalidas(self):
        for puntos in [[[0,0],[1,1],[0,1],[1,0]],[[0,0],[1,0],[2,0]],[[0,0],[1,0],[0,0]],[[0,0],[1,0],[0,91]]]:
            valor=entrada();valor['vertices']=[{'longitud':x,'latitud':y} for x,y in puntos]
            valor['geometria']['coordinates']=[puntos+[puntos[0]]]
            self.assertEqual(self.client.post(self.base,json=valor).status_code,422)
        self.assertFalse(self.ruta.exists())

    def test_cierre_y_coherencia(self):
        for anillo in [[[0,0],[1,0],[0,1]],[[0,0],[0,1],[1,0],[0,0]]]:
            valor=entrada();valor['geometria']['coordinates']=[anillo]
            self.assertEqual(self.client.post(self.base,json=valor).status_code,422)

    def test_estilo_nombre_y_srid(self):
        for campo,valor in [('nombre',' '),('srid',3857),('extra',True)]:
            payload=entrada();payload[campo]=valor
            self.assertEqual(self.client.post(self.base,json=payload).status_code,422)
        payload=entrada();payload['estilo']['opacidadRelleno']=2
        self.assertEqual(self.client.post(self.base,json=payload).status_code,422)

    def test_actualizacion_concurrente_y_borrado_obsoleto(self):
        registro=self.client.post(self.base,json=entrada()).json();url=self.base+'/'+registro['id']
        with ThreadPoolExecutor(max_workers=2) as pool:
            respuestas=list(pool.map(lambda _:self.client.put(url,json=entrada(),headers={'If-Match':'"1"'}).status_code,range(2)))
        self.assertEqual(sorted(respuestas),[200,409])
        self.assertEqual(self.client.delete(url,headers={'If-Match':'"1"'}).status_code,409)
        self.assertEqual(self.client.put(url,json=entrada()).status_code,422)

    def test_creaciones_concurrentes_entre_instancias(self):
        with TestClient(create_app(self.ruta)) as otro:
            with ThreadPoolExecutor(max_workers=6) as pool:
                respuestas=list(pool.map(lambda i:(self.client if i%2 else otro).post(self.base,json=entrada()).status_code,range(12)))
        self.assertEqual(respuestas,[201]*12)
        registros=self.client.get(self.base).json();self.assertEqual(len(registros),12)
        self.assertEqual(len({r['id'] for r in registros}),12)

    def test_archivo_corrupto_no_se_reemplaza(self):
        self.ruta.write_text('archivo corrupto',encoding='utf-8')
        self.assertEqual(self.client.get(self.base).status_code,500)
        self.assertEqual(self.client.post(self.base,json=entrada()).status_code,500)
        self.assertEqual(self.ruta.read_text(),'archivo corrupto')

    def test_fallo_escritura_preserva_registros(self):
        self.client.post(self.base,json=entrada());original=self.ruta.read_bytes()
        with patch('main.os.replace',side_effect=OSError('simulado')):
            self.assertEqual(self.client.post(self.base,json=entrada()).status_code,500)
        self.assertEqual(self.ruta.read_bytes(),original)
        self.assertEqual(list(self.ruta.parent.glob('tmp*')),[])


if __name__=='__main__':unittest.main()
