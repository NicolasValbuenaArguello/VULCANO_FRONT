param([switch]$SoloLectura)
$ErrorActionPreference = 'Stop'
$validationApplication = $null
$validationDocument = $null
try {
  $validationApplication = New-Object -ComObject Word.Application
  $validationApplication.Visible = $false
  $validationApplication.DisplayAlerts = 0
  $validationApplication.AutomationSecurity = 3
  $validationDocPath = Join-Path $PSScriptRoot 'VULCANO_SPRINT_AUTENTICACION_SEGURIDAD.docx'
  $validationPdfPath = [IO.Path]::ChangeExtension($validationDocPath, '.pdf')
  $validationDocument = $validationApplication.Documents.Open($validationDocPath, $false, [bool]$SoloLectura)
  $validationPageCount = $null
  if (-not $SoloLectura) {
    $validationDocument.Fields.Update() | Out-Null
    $validationDocument.Repaginate()
    $validationPageCount = $validationDocument.ComputeStatistics(2)
    $validationDocument.Save()
    $validationDocument.ExportAsFixedFormat($validationPdfPath, 17)
  }
  [pscustomobject]@{ apertura_microsoft_word = $true; solo_lectura = [bool]$SoloLectura; paginas_word_estimadas = $validationPageCount; exportacion_pdf = (Test-Path -LiteralPath $validationPdfPath); fecha = '2026-10-27'; nota = 'Apertura COM Microsoft Word confirmada. En modo normal actualiza campos y exporta PDF; en solo lectura no guarda, no actualiza campos ni exporta. Sin aprobacion editorial. Ejecucion fuera del sandbox; intento inicial COM dentro del sandbox no disponible.' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'evidencias/validacion-documento.json') -Encoding utf8
  if ($SoloLectura) { Write-Output "DOCX final abierto en Microsoft Word sin modificaciones." }
  else { Write-Output "Word validado y PDF exportado: $validationPageCount paginas." }
} finally {
  if ($validationDocument) { $validationDocument.Close(0) }
  if ($validationApplication) { $validationApplication.Quit() }
}
