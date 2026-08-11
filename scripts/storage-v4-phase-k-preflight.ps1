param(
  [string]$Project = 'atlasmap-dev',
  [string]$Database = '(default)',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-GcloudJson {
  param([string[]]$Arguments)
  $raw = & gcloud @Arguments --format=json 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud fallo: $($raw -join [Environment]::NewLine)"
  }
  $text = ($raw -join [Environment]::NewLine).Trim()
  if (-not $text) { return $null }
  return $text | ConvertFrom-Json
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$account = (& gcloud config get-value account 2>$null).Trim()
if (-not $account -or $account -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

$database = Invoke-GcloudJson @(
  'firestore', 'databases', 'describe',
  "--database=$Database",
  "--project=$Project"
)

$backupSchedules = Invoke-GcloudJson @(
  'firestore', 'backups', 'schedules', 'list',
  "--database=$Database",
  "--project=$Project"
)

$result = [ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  database = $Database
  activeAccountPresent = $true
  locationId = $database.locationId
  pointInTimeRecoveryEnablement = $database.pointInTimeRecoveryEnablement
  versionRetentionPeriod = $database.versionRetentionPeriod
  earliestVersionTime = $database.earliestVersionTime
  deleteProtectionState = $database.deleteProtectionState
  backupSchedules = @($backupSchedules)
}

$json = $result | ConvertTo-Json -Depth 12

if ($OutputPath) {
  $parent = Split-Path -Parent $OutputPath
  if ($parent -and -not (Test-Path $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Set-Content -Path $OutputPath -Value $json -Encoding utf8
}

$json
