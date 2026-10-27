# Entrega documental del sprint de autenticacion

El entregable principal es VULCANO_SPRINT_AUTENTICACION_SEGURIDAD.docx. Se acompana PDF de presentacion, cuatro anexos Markdown, diagramas y evidencias de ejecucion.

Estado: bootstrap y cierre local comprobados en pruebas simuladas; politica numerica aislada; integracion v1, refresh, inactividad, Redis y seguridad administrativa pendientes.

Resultados de este corte: 53 pruebas enfocadas aprobadas; suite completa con 166 aprobadas y 10 fallidas; desarrollo compila y produccion falla por presupuesto CSS de Hoja Milimetrada. El Word final se abrio en Microsoft Word, sin guardar despues de retirar metadatos personales. Ver evidencias/validacion-documento.json y validacion-estructural.json.

## Reproduccion de documentos

No se instalaron dependencias del frontend. Los scripts documentales utilizan python-docx, Pillow, lxml y PyMuPDF disponibles en el entorno de esta revision. Microsoft Word de escritorio se utiliza solo para apertura, paginacion y exportacion. No se envian credenciales ni se ejecutan operaciones autenticadas contra backend.

1. Conservar o actualizar las evidencias y los resultados del generador cuando cambie el codigo; el generador verifica los conteos de este corte para impedir reutilizarlos silenciosamente.
2. Ejecutar python documentacion_tecnica/autenticacion/generar_documentacion.py desde la raiz.
3. Ejecutar el script validar_word.ps1 fuera del sandbox para actualizar campos y exportar PDF.
4. Ejecutar python documentacion_tecnica/autenticacion/verificar_entregables.py para retirar metadatos personales y verificar OOXML/huellas.
5. Abrir con validar_word.ps1 -SoloLectura sin guardar posteriormente; no regenera el PDF ni cambia metadatos.

Los archivos JavaScript de comparacion son hashes, no copias de codigo ni tokens. La evidencia Git distingue commits reales de modificaciones sin commit; las fechas de revision no se atribuyen al desarrollo original. Responsable y estado de la portada son campos editables para el proceso institucional.
