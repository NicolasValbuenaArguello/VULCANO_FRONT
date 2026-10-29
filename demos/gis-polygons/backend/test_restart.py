"""Verifica persistencia a traves de dos procesos Uvicorn reales y HTTP loopback."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from test_main import entrada


class ReinicioTests(unittest.TestCase):
    def test_reinicio_proceso_real(self):
        base=Path(__file__).resolve().parents[3]/'.tmp/gis-tests';base.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=base) as carpeta:
            assert Path(carpeta).resolve().is_relative_to(base.resolve())
            ruta=Path(carpeta)/'persistencia.json'
            with socket.socket() as socket_prueba:
                socket_prueba.bind(('127.0.0.1',0));puerto=socket_prueba.getsockname()[1]
            origen=f'http://127.0.0.1:{puerto}'
            # Loopback de prueba: no enviar solicitudes a proxies corporativos.
            abrir=urllib.request.build_opener(urllib.request.ProxyHandler({})).open
            entorno={**os.environ,'GIS_POLYGONS_FILE':str(ruta)}
            def iniciar():
                proceso=subprocess.Popen([sys.executable,'-m','uvicorn','main:app','--host','127.0.0.1','--port',str(puerto),'--log-level','error'],
                    cwd=Path(__file__).parent,env=entorno,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
                try:
                    for _ in range(100):
                        if proceso.poll() is not None:raise RuntimeError('Uvicorn termino antes de iniciar')
                        try:
                            abrir(origen+'/openapi.json',timeout=.2).close();return proceso
                        except OSError:time.sleep(.05)
                    raise RuntimeError('Uvicorn no disponible')
                except BaseException:
                    proceso.terminate();proceso.wait(timeout=10);raise
            proceso=iniciar()
            try:
                request=urllib.request.Request(origen+'/api/gis/poligonos',json.dumps(entrada()).encode(),{'Content-Type':'application/json'},method='POST')
                with abrir(request) as respuesta:registro=json.load(respuesta)
            finally:proceso.terminate();proceso.wait(timeout=10)
            proceso=iniciar()
            try:
                with abrir(origen+'/api/gis/poligonos/'+registro['id']) as respuesta:
                    self.assertEqual(json.load(respuesta),registro)
            finally:proceso.terminate();proceso.wait(timeout=10)


if __name__=='__main__':unittest.main()
