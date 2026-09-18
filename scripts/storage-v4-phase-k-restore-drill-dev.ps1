param(
  [string]$Project = 'atlasmap-dev',
  [string]$Location = 'northamerica-south1',
  [string]$SourceDatabaseId = '(default)',
  [string]$SourceBackup = '',
  [string]$DestinationDatabase = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este restore drill esta bloqueado deliberadamente a atlasmap-dev.'
}
if ($Location -ne 'northamerica-south1') {
  throw 'El restore drill dev debe permanecer en northamerica-south1.'
}
if ($SourceDatabaseId -ne '(default)') {
  throw 'El restore drill actual solo acepta (default) como base fuente.'
}

[ordered]@{
  project = $Project
  location = $Location
  sourceDatabase = $SourceDatabaseId
  sourceBackup = if ($SourceBackup) { $SourceBackup } else { $null }
  destinationDatabase = if ($DestinationDatabase) { $DestinationDatabase } else { $null }
  applyRequested = [bool]$Apply
  createsIsolatedDatabase = $true
  deletesResources = $false
  touchesDefaultDatabase = $false
  enablesStorageV4Write = $false
  touchesProduction = $false
  costBearingChange = $true
} | ConvertTo-Json -Depth 6

if (-not $Apply) {
  Write-Output 'Dry-run: el restore requiere -Apply, un SourceBackup explicito y un DestinationDatabase con prefijo atlas-restore-drill-.'
  exit 0
}

if (-not $SourceBackup) { throw 'Falta -SourceBackup.' }
if (-not $DestinationDatabase) { throw 'Falta -DestinationDatabase.' }
if ($DestinationDatabase -eq '(default)') { throw 'Nunca se permite restaurar sobre (default).' }
if (-not $DestinationDatabase.StartsWith('atlas-restore-drill-')) {
  throw 'DestinationDatabase debe comenzar con atlas-restore-drill-.'
}
if ($DestinationDatabase.Length -lt 4 -or $DestinationDatabase.Length -gt 63) {
  throw 'DestinationDatabase debe tener entre 4 y 63 caracteres.'
}
if ($DestinationDatabase -notmatch '^[a-z][a-z0-9-]{2,61}[a-z0-9]$') {
  throw 'DestinationDatabase contiene caracteres o extremos invalidos.'
}

$expectedBackupPrefix = "projects/$Project/locations/$Location/backups/"
if (-not $SourceBackup.StartsWith($expectedBackupPrefix)) {
  throw 'SourceBackup debe pertenecer a atlasmap-dev/northamerica-south1.'
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

function Invoke-Gcloud {
  param([string[]]$Arguments)
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud fallo: $($Arguments -join ' ')"
  }
}

$backups = Invoke-GcloudJson @(
  'firestore', 'backups', 'list',
  "--location=$Location",
  "--project=$Project"
)
$backup = @($backups | Where-Object { [string]$_.name -eq $SourceBackup }) | Select-Object -First 1
if (-not $backup) { throw 'El SourceBackup indicado no existe en el entorno esperado.' }
if ([string]$backup.state -ne 'READY') { throw 'El SourceBackup indicado no esta READY.' }

$expectedDatabaseResource = "projects/$Project/databases/$SourceDatabaseId"
if ([string]$backup.database -ne $expectedDatabaseResource) {
  throw 'El SourceBackup no pertenece a la base (default) esperada.'
}

$databases = Invoke-GcloudJson @(
  'firestore', 'databases', 'list',
  "--project=$Project"
)
$destinationAlreadyExists = @($databases | Where-Object {
  (([string]$_.name -split '/')[-1]) -eq $DestinationDatabase
}).Count -gt 0
if ($destinationAlreadyExists) {
  throw 'DestinationDatabase ya existe; el drill nunca sobrescribe una base.'
}

$startedAt = [DateTime]::UtcNow
Invoke-Gcloud @(
  'firestore', 'databases', 'restore',
  "--source-backup=$SourceBackup",
  "--destination-database=$DestinationDatabase",
  "--project=$Project",
  '--quiet'
)
$completedAt = [DateTime]::UtcNow

$restored = Invoke-GcloudJson @(
  'firestore', 'databases', 'describe',
  "--database=$DestinationDatabase",
  "--project=$Project"
)
$restoredInfo = @($restored) | Select-Object -First 1

[ordered]@{
  project = $Project
  applied = $true
  sourceBackup = $SourceBackup
  destinationDatabase = $DestinationDatabase
  destinationLocationId = [string]$restoredInfo.locationId
  destinationPointInTimeRecoveryEnablement = [string]$restoredInfo.pointInTimeRecoveryEnablement
  startedAtUtc = $startedAt.ToString('o')
  completedAtUtc = $completedAt.ToString('o')
  durationSeconds = [Math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
  defaultDatabaseUntouched = $true
  cleanupPerformed = $false
  cleanupRequiresSeparateDecision = $true
  storageV4WriteUnchanged = $true
  productionUntouched = $true
} | ConvertTo-Json -Depth 8
