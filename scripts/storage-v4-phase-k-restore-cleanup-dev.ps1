param(
  [string]$Project = 'atlasmap-dev',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este cleanup esta bloqueado deliberadamente a atlasmap-dev.'
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$activeAccount = (& gcloud config get-value account 2>$null).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

function Invoke-GcloudJson {
  param([string[]]$Arguments)
  $raw = & gcloud @Arguments --format=json 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud fallo: $($raw -join [Environment]::NewLine)"
  }
  $text = ($raw -join [Environment]::NewLine).Trim()
  if (-not $text) { return @() }
  return @($text | ConvertFrom-Json)
}

$databases = @(Invoke-GcloudJson @('firestore', 'databases', 'list', "--project=$Project"))
$restoreDatabases = @($databases | Where-Object {
  (([string]$_.name -split '/')[-1]) -like 'atlas-restore-drill-*'
})

if ($restoreDatabases.Count -eq 0) {
  [ordered]@{
    project = $Project
    applyRequested = [bool]$Apply
    cleanupNeeded = $false
    alreadyClean = $true
    restoreDatabaseCount = 0
    deletesResources = $false
    touchesDefaultDatabase = $false
    enablesStorageV4Write = $false
    touchesProduction = $false
  } | ConvertTo-Json -Depth 6
  Write-Output 'Restore cleanup: no existe ninguna base atlas-restore-drill-*; entorno ya limpio.'
  exit 0
}

if ($restoreDatabases.Count -ne 1) {
  throw 'Restore cleanup abortado: se esperaba como maximo una base atlas-restore-drill-* y se detectaron varias.'
}

$databaseId = (([string]$restoreDatabases[0].name -split '/')[-1])
if (-not $databaseId.StartsWith('atlas-restore-drill-')) {
  throw 'Restore cleanup abortado: el destino no cumple el prefijo aislado requerido.'
}
if ($databaseId -eq '(default)') {
  throw 'Restore cleanup abortado: nunca se permite operar sobre (default).'
}

$detail = @(Invoke-GcloudJson @(
  'firestore', 'databases', 'describe',
  "--database=$databaseId",
  "--project=$Project"
)) | Select-Object -First 1

$sourceBackup = [string]$detail.sourceInfo.backup.backup
$sourceOperation = [string]$detail.sourceInfo.operation
$etag = [string]$detail.etag

if (-not $sourceBackup.StartsWith("projects/$Project/locations/")) {
  throw 'Restore cleanup abortado: la base no expone una procedencia de backup del proyecto dev.'
}
if (-not $sourceOperation) {
  throw 'Restore cleanup abortado: la base no expone sourceInfo.operation de un restore administrado.'
}
if (-not $etag) {
  throw 'Restore cleanup abortado: falta etag; no se elimina sin precondicion de concurrencia.'
}

[ordered]@{
  project = $Project
  applyRequested = [bool]$Apply
  cleanupNeeded = $true
  restoreDatabaseCount = 1
  destinationDatabase = $databaseId
  managedRestoreLineagePresent = $true
  etagPreconditionPresent = $true
  deletesExactlyOneRestoreDatabase = [bool]$Apply
  touchesDefaultDatabase = $false
  enablesStorageV4Write = $false
  touchesProduction = $false
  mutatesBudgets = $false
} | ConvertTo-Json -Depth 6

if (-not $Apply) {
  Write-Output 'Dry-run: base temporal validada; no se elimino ninguna base.'
  exit 0
}

& gcloud firestore databases delete `
  "--database=$databaseId" `
  "--etag=$etag" `
  "--project=$Project" `
  --quiet
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo eliminar la base temporal $databaseId."
}

$remaining = @(Invoke-GcloudJson @('firestore', 'databases', 'list', "--project=$Project"))
$remainingRestore = @($remaining | Where-Object {
  (([string]$_.name -split '/')[-1]) -like 'atlas-restore-drill-*'
})
if ($remainingRestore.Count -ne 0) {
  throw 'Post-check invalido: aun existe una base atlas-restore-drill-* despues del cleanup.'
}

[ordered]@{
  project = $Project
  applied = $true
  deletedDatabase = $databaseId
  remainingRestoreDatabaseCount = 0
  defaultDatabaseUntouched = $true
  storageV4WriteUnchanged = $true
  budgetsUntouched = $true
  productionUntouched = $true
} | ConvertTo-Json -Depth 6

Write-Output 'Restore cleanup completado: la base temporal fue eliminada y (default) permanecio intacta.'
