param(
  [string]$Project = 'atlasmap-dev',
  [string]$DatabaseId = '(default)',
  [string]$BackupRetention = '7d',
  [ValidateSet('daily', 'weekly')]
  [string]$Recurrence = 'daily',
  [ValidateSet('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')]
  [string]$DayOfWeek = 'MON',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este script esta bloqueado deliberadamente a atlasmap-dev. Produccion requiere otro procedimiento y autorizacion explicita.'
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$account = (& gcloud config get-value account 2>$null).Trim()
if (-not $account -or $account -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

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

function Get-RecoveryState {
  $databaseInfo = Invoke-GcloudJson @(
    'firestore', 'databases', 'describe',
    "--database=$DatabaseId",
    "--project=$Project"
  )

  $schedules = Invoke-GcloudJson @(
    'firestore', 'backups', 'schedules', 'list',
    "--database=$DatabaseId",
    "--project=$Project"
  )

  return [pscustomobject]@{
    databaseInfo = $databaseInfo
    schedules = @($schedules)
  }
}

$before = Get-RecoveryState
$needsPitr = [string]$before.databaseInfo.pointInTimeRecoveryEnablement -ne 'POINT_IN_TIME_RECOVERY_ENABLED'
$needsBackupSchedule = @($before.schedules).Count -eq 0

$plan = [ordered]@{
  project = $Project
  database = $DatabaseId
  applyRequested = [bool]$Apply
  currentPitr = $before.databaseInfo.pointInTimeRecoveryEnablement
  currentVersionRetentionPeriod = $before.databaseInfo.versionRetentionPeriod
  currentBackupScheduleCount = @($before.schedules).Count
  enablePitr = $needsPitr
  createBackupSchedule = $needsBackupSchedule
  backupRecurrence = $Recurrence
  backupRetention = $BackupRetention
  backupDayOfWeek = if ($Recurrence -eq 'weekly') { $DayOfWeek } else { $null }
  costBearingChanges = @('PITR storage', 'scheduled backup storage')
}

if (-not $Apply) {
  $plan | ConvertTo-Json -Depth 8
  exit 0
}

if ($needsPitr) {
  $pitrArgs = @(
    'firestore', 'databases', 'update',
    "--database=$DatabaseId",
    "--project=$Project",
    '--enable-pitr',
    '--quiet'
  )
  & gcloud @pitrArgs
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo habilitar PITR.' }
}

if ($needsBackupSchedule) {
  $backupArgs = @(
    'firestore', 'backups', 'schedules', 'create',
    "--database=$DatabaseId",
    "--project=$Project",
    "--retention=$BackupRetention",
    "--recurrence=$Recurrence",
    '--quiet'
  )
  if ($Recurrence -eq 'weekly') {
    $backupArgs += "--day-of-week=$DayOfWeek"
  }
  & gcloud @backupArgs
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el scheduled backup.' }
}

$after = Get-RecoveryState
$result = [ordered]@{
  project = $Project
  database = $DatabaseId
  applied = $true
  pitr = $after.databaseInfo.pointInTimeRecoveryEnablement
  versionRetentionPeriod = $after.databaseInfo.versionRetentionPeriod
  earliestVersionTime = $after.databaseInfo.earliestVersionTime
  backupScheduleCount = @($after.schedules).Count
  backupSchedules = @($after.schedules)
}

$result | ConvertTo-Json -Depth 12
