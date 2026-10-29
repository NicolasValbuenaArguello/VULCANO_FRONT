import sys
from pathlib import Path
sys.path.insert(0,'D:\\2026\\VULCANO\\vulcano\\demos\\gis-polygons\\backend')
from main import create_app
from fastapi.staticfiles import StaticFiles
app=create_app(Path(__file__).parent/'browser-poligonos.json')
app.mount('/gis-preview',StaticFiles(directory=Path(__file__).parent,html=True))
