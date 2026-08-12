param(
  [string]$Project = 'atlasmap-dev',
  [string]$Location = 'northamerica-south1',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este restore checkpoint esta bloqueado deliberadamente a atlasmap-dev.'
}
if ($Location -ne 'northamerica-south1') {
  throw 'El restore checkpoint debe permanecer en northamerica-south1.'
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

$backups = @(Invoke-GcloudJson @(
  'firestore', 'backups', 'list',
  "--location=$Location",
  "--project=$Project"
))
$expectedDatabase = "projects/$Project/databases/(default)"
$ready = @($backups | Where-Object {
  [string]$_.state -eq 'READY' -and [string]$_.database -eq $expectedDatabase
} | Sort-Object snapshotTime -Descending)

if ($ready.Count -lt 1) {
  throw 'No existe un backup READY de (default) para ejecutar el restore drill.'
}

$selected = $ready[0]
$destination = 'atlas-restore-drill-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss').ToLowerInvariant()
$databases = @(Invoke-GcloudJson @('firestore', 'databases', 'list', "--project=$Project"))
$existingDrills = @($databases | Where-Object {
  (([string]$_.name -split '/')[-1]) -like 'atlas-restore-drill-*'
})
if ($existingDrills.Count -gt 0) {
  throw 'Ya existe una base atlas-restore-drill-*; no se crea otra hasta resolver la anterior.'
}

[ordered]@{
  project = $Project
  location = $Location
  applyRequested = [bool]$Apply
  selectedBackup = [string]$selected.name
  selectedSnapshotTime = [string]$selected.snapshotTime
  destinationDatabase = $destination
  createsIsolatedDatabase = $true
  costBearingChange = $true
  deletesResources = $false
  touchesDefaultDatabase = $false
  enablesStorageV4Write = $false
  touchesProduction = $false
} | ConvertTo-Json -Depth 6

if (-not $Apply) {
  Write-Output 'Dry-run: backup READY seleccionado y destino aislado calculado; no se ejecuto restore.'
  exit 0
}

$drillScript = Join-Path $PSScriptRoot 'storage-v4-phase-k-restore-drill-dev.ps1'
& $drillScript `
  -Project $Project `
  -Location $Location `
  -SourceDatabaseId '(default)' `
  -SourceBackup ([string]$selected.name) `
  -DestinationDatabase $destination `
  -Apply

if ($LASTEXITCODE -ne 0) {
  throw 'El restore drill devolvio un codigo de salida no exitoso.'
}

Write-Output 'Restore checkpoint completado. La base restaurada se conserva para validacion; cleanup sigue siendo una decision separada.'
