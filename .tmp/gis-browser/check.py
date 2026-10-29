import subprocess,sys,urllib.request,time,socket,json,re,html
from pathlib import Path
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'demos/gis-polygons/backend'))
from test_main import entrada
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
base=f'http://127.0.0.1:{port}'
abrir=urllib.request.build_opener(urllib.request.ProxyHandler({})).open
datos=Path(__file__).parent/'browser-poligonos.json'
if datos.exists():datos.unlink()
p=subprocess.Popen([sys.executable,'-m','uvicorn','server:app','--app-dir',str(Path(__file__).parent),'--host','127.0.0.1','--port',str(port),'--log-level','error'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
try:
 for _ in range(100):
  try:abrir(base+'/openapi.json',timeout=.2).close();break
  except OSError:time.sleep(.1)
 req=urllib.request.Request(base+'/api/gis/poligonos',json.dumps(entrada()).encode(),{'Content-Type':'application/json'},method='POST')
 with abrir(req) as response: registro=json.load(response)
 with socket.socket() as socket_debug:socket_debug.bind(('127.0.0.1',0));debug_port=socket_debug.getsockname()[1]
 cmd=[r'C:\Program Files\Google\Chrome\Application\chrome.exe','--headless','--no-first-run','--no-default-browser-check',
  '--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1500,1000','--remote-debugging-port='+str(debug_port),
  '--user-data-dir='+str(Path(__file__).parent/'chrome-profile'),base+'/gis-preview/']
 chrome=subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
 try:
  result=subprocess.run(['node',str(Path(__file__).parent/'cdp.cjs'),str(debug_port),str(root/'docs/previews/gis-independiente.png')],capture_output=True,timeout=45,creationflags=subprocess.CREATE_NO_WINDOW)
  if result.returncode:print(result.stderr.decode('utf-8',errors='replace'));raise SystemExit(1)
  datos=json.loads(result.stdout.decode('utf-8-sig'))
  (root/'docs/previews/gis-independiente-checks.json').write_text(json.dumps(datos,indent=2),encoding='utf-8')
  print(json.dumps(datos))
  assert datos['nombre'] and datos['leaflet']>0 and datos['poligonos3d']>0 and datos['fuenteCargada']
 finally:
  try:chrome.wait(timeout=5)
  except subprocess.TimeoutExpired:chrome.terminate();chrome.wait(timeout=10)

finally:
 p.terminate();p.wait(timeout=10)
