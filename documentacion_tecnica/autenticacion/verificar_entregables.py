"""Retira metadatos personales y comprueba el paquete OOXML final sin cambiar su contenido técnico."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree
import json
import hashlib
import fitz

base = Path(__file__).resolve().parent
path = base / 'VULCANO_SPRINT_AUTENTICACION_SEGURIDAD.docx'
with ZipFile(path) as source:
    parts = {name: source.read(name) for name in source.namelist()}
core = etree.fromstring(parts['docProps/core.xml'])
for node in core:
    if etree.QName(node).localname in ['creator', 'lastModifiedBy']:
        node.text = 'Responsable por definir'
parts['docProps/core.xml'] = etree.tostring(core, xml_declaration=True, encoding='UTF-8', standalone=True)
temp = path.with_suffix('.verificado.docx')
with ZipFile(temp, 'w', ZIP_DEFLATED) as output:
    for name, value in parts.items():
        output.writestr(name, value)
temp.replace(path)
with ZipFile(path) as checked:
    assert checked.testzip() is None
    for name in checked.namelist():
        if name.endswith('.xml'):
            etree.fromstring(checked.read(name))
    assert len([name for name in checked.namelist() if name.startswith('word/media/')]) == 2
pdf_path = path.with_suffix('.pdf')
pdf = fitz.open(pdf_path)
metadata = pdf.metadata
metadata['author'] = 'Responsable por definir'
pdf.set_metadata(metadata)
temporary_pdf = pdf_path.with_suffix('.verificado.pdf')
pdf.save(temporary_pdf, garbage=4, deflate=True)
pages = len(pdf)
pdf.close()
temporary_pdf.replace(pdf_path)
required = ['VULCANO_SPRINT_AUTENTICACION_SEGURIDAD.docx', 'ARQUITECTURA_AUTENTICACION.md',
            'MATRIZ_TRAZABILIDAD_AUTENTICACION.md', 'BITACORA_DESARROLLO_AUTENTICACION.md',
            'INVENTARIO_ARCHIVOS_AUTENTICACION.md']
result = {'fecha': '2026-10-27', 'ooxml_integro': True, 'xml_valido': True,
          'diagramas_incrustados': 2, 'paginas_pdf': pages, 'metadatos_personales_retirados': True,
          'archivos': {name: {'bytes': (base/name).stat().st_size,
                             'sha256': hashlib.sha256((base/name).read_bytes()).hexdigest()} for name in required}}
(base/'evidencias/validacion-estructural.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Cinco entregables comprobados; OOXML íntegro; {pages} páginas PDF; metadatos personales retirados.')
