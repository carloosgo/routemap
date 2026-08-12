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
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'No se encontro node en PATH.'
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

function Get-RestoreDatabaseDetail {
  param([string]$DatabaseId)
  return @(Invoke-GcloudJson @(
    'firestore', 'databases', 'describe',
    "--database=$DatabaseId",
    "--project=$Project"
  )) | Select-Object -First 1
}

function Wait-FirestoreRestoreOperation {
  param(
    [string]$DatabaseId,
    [string]$OperationName,
    [int]$TimeoutSeconds = 900,
    [int]$PollSeconds = 5
  )

  if (-not $OperationName) {
    Write-Output 'La base no expone una operacion de restore pendiente; se continua con la validacion.'
    return
  }

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $lastState = ''

  while ([DateTime]::UtcNow -lt $deadline) {
    $operation = @(Invoke-GcloudJson @(
      'firestore', 'operations', 'describe',
      $OperationName,
      "--database=$DatabaseId",
      "--project=$Project"
    )) | Select-Object -First 1

    if ($operation.error) {
      $code = [string]$operation.error.code
      $message = [string]$operation.error.message
      throw "La operacion de restore fallo (code=$code): $message"
    }

    if ([bool]$operation.done) {
      Write-Output 'La operacion administrada de restore termino; se inicia la validacion de datos.'
      return
    }

    $state = [string]$operation.metadata.operationState
    if ($state -and $state -ne $lastState) {
      Write-Output "Restore aun en progreso (operationState=$state); esperando antes de leer la base."
      $lastState = $state
    }

    Start-Sleep -Seconds $PollSeconds
  }

  throw "Timeout esperando que termine el restore de $DatabaseId despues de $TimeoutSeconds segundos. La base se conserva intacta."
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

$databases = @(Invoke-GcloudJson @('firestore', 'databases', 'list', "--project=$Project"))
$existingDrills = @($databases | Where-Object {
  (([string]$_.name -split '/')[-1]) -like 'atlas-restore-drill-*'
})
if ($existingDrills.Count -gt 1) {
  throw 'Hay mas de una base atlas-restore-drill-*; no se adivina cual corresponde al drill actual.'
}

$selected = $null
$destination = $null
$resumeExisting = $existingDrills.Count -eq 1
$managedRestoreLineageVerified = $false
$restoreOperationName = ''

if ($resumeExisting) {
  $existingId = (([string]$existingDrills[0].name -split '/')[-1])
  $existingDetail = Get-RestoreDatabaseDetail -DatabaseId $existingId
  $sourceBackup = [string]$existingDetail.sourceInfo.backup.backup
  if (-not $sourceBackup) {
    throw 'La base de restore existente no expone sourceInfo.backup; se conserva y no se intenta adivinar su origen.'
  }
  $selected = @($backups | Where-Object { [string]$_.name -eq $sourceBackup }) | Select-Object -First 1
  if (-not $selected -or [string]$selected.state -ne 'READY' -or [string]$selected.database -ne $expectedDatabase) {
    throw 'La procedencia de la base restaurada no coincide con un backup READY de (default).'
  }
  $destination = $existingId
  $managedRestoreLineageVerified = $true
  $restoreOperationName = [string]$existingDetail.sourceInfo.operation
} else {
  $selected = $ready[0]
  $destination = 'atlas-restore-drill-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss').ToLowerInvariant()
}

[ordered]@{
  project = $Project
  location = $Location
  applyRequested = [bool]$Apply
  selectedBackup = [string]$selected.name
  selectedSnapshotTime = [string]$selected.snapshotTime
  destinationDatabase = $destination
  resumeExistingRestoreDatabase = $resumeExisting
  createsIsolatedDatabase = -not $resumeExisting
  verifiesManagedRestoreLineage = $true
  managedRestoreLineageVerifiedBeforeValidation = $managedRestoreLineageVerified
  waitsForRestoreOperationCompletion = $true
  validatesRestoredDatabaseReadability = $true
  exactSourceParityWhenFirestoreAllows = $true
  costBearingChange = -not $resumeExisting
  deletesResources = $false
  touchesDefaultDatabase = $false
  enablesStorageV4Write = $false
  touchesProduction = $false
} | ConvertTo-Json -Depth 6

if (-not $Apply) {
  Write-Output 'Dry-run: restore checkpoint preparado; no se creo, modifico ni elimino ninguna base.'
  exit 0
}

if (-not $resumeExisting) {
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

  $restoredDetail = Get-RestoreDatabaseDetail -DatabaseId $destination
  $restoredSourceBackup = [string]$restoredDetail.sourceInfo.backup.backup
  if ($restoredSourceBackup -ne [string]$selected.name) {
    throw 'La base fue restaurada pero su sourceInfo.backup no coincide con el backup seleccionado; se conserva para diagnostico.'
  }
  $managedRestoreLineageVerified = $true
  $restoreOperationName = [string]$restoredDetail.sourceInfo.operation
} else {
  Write-Output "Se reutiliza la base restaurada existente $destination; no se crea una segunda base ni se repite el restore."
}

Wait-FirestoreRestoreOperation `
  -DatabaseId $destination `
  -OperationName $restoreOperationName

$readyDetail = Get-RestoreDatabaseDetail -DatabaseId $destination
$readySourceBackup = [string]$readyDetail.sourceInfo.backup.backup
if ($readySourceBackup -ne [string]$selected.name) {
  throw 'Despues de esperar el restore, la procedencia administrada ya no coincide con el backup seleccionado.'
}

$validator = Join-Path $PSScriptRoot 'validateStorageV4PhaseKRestore.mjs'
$accessToken = (& gcloud auth print-access-token 2>$null).Trim()
if (-not $accessToken) {
  throw 'No se pudo obtener token para validar la base restaurada. Se conserva para diagnostico.'
}

try {
  $env:ATLAS_GCLOUD_ACCESS_TOKEN = $accessToken
  & node $validator `
    "--source-read-time=$([string]$selected.snapshotTime)" `
    "--destination-db=$destination"
  if ($LASTEXITCODE -ne 0) {
    throw 'La base restaurada existe pero la validacion no paso. Se conserva intacta para diagnostico.'
  }
} finally {
  Remove-Item Env:ATLAS_GCLOUD_ACCESS_TOKEN -ErrorAction SilentlyContinue
  $accessToken = $null
}

[ordered]@{
  project = $Project
  restoreCheckpointPassed = $true
  destinationDatabase = $destination
  selectedBackup = [string]$selected.name
  managedRestoreLineageVerified = $managedRestoreLineageVerified
  restoreOperationCompletionVerified = $true
  restoredDatabaseReadable = $true
  exactParityConditionalOnFirestoreHistoricalReadWindow = $true
  cleanupPerformed = $false
  productionUntouched = $true
  defaultDatabaseUntouched = $true
} | ConvertTo-Json -Depth 6

Write-Output 'Restore checkpoint completado. Se verifico que la operacion administrada terminara antes de leer, ademas de procedencia y legibilidad de la base restaurada.'
