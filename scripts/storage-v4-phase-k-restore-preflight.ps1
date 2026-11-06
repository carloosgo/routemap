param(
  [string]$Project = 'atlasmap-dev',
  [string]$Location = 'northamerica-south1',
  [string]$SourceDatabaseId = '(default)'
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este preflight esta bloqueado deliberadamente a atlasmap-dev.'
}
if ($Location -ne 'northamerica-south1') {
  throw 'El restore drill dev debe permanecer en northamerica-south1.'
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

$backups = Invoke-GcloudJson @(
  'firestore', 'backups', 'list',
  "--location=$Location",
  "--project=$Project"
)
$sourceDatabaseResource = "projects/$Project/databases/$SourceDatabaseId"
$sourceBackups = @($backups | Where-Object {
  [string]$_.database -eq $sourceDatabaseResource
})

$databases = Invoke-GcloudJson @(
  'firestore', 'databases', 'list',
  "--project=$Project"
)
$drillDatabases = @($databases | Where-Object {
  $id = ([string]$_.name -split '/')[-1]
  $id -like 'atlas-restore-drill-*'
})

[ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  location = $Location
  sourceDatabase = $SourceDatabaseId
  activeAccountPresent = $true
  sourceBackupCount = $sourceBackups.Count
  sourceBackups = @($sourceBackups | Sort-Object snapshotTime -Descending | ForEach-Object {
    [ordered]@{
      name = [string]$_.name
      state = [string]$_.state
      snapshotTime = [string]$_.snapshotTime
      expireTime = [string]$_.expireTime
    }
  })
  existingRestoreDrillDatabaseCount = $drillDatabases.Count
  existingRestoreDrillDatabases = @($drillDatabases | ForEach-Object {
    [ordered]@{
      databaseId = ([string]$_.name -split '/')[-1]
      locationId = [string]$_.locationId
      createTime = [string]$_.createTime
    }
  })
} | ConvertTo-Json -Depth 8
