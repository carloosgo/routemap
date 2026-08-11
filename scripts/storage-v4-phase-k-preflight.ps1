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

function Get-HttpStatusCode {
  param($ErrorRecord)
  try {
    if ($null -ne $ErrorRecord.Exception.Response.StatusCode) {
      return [int]$ErrorRecord.Exception.Response.StatusCode
    }
  } catch {
    return $null
  }
  return $null
}

function Invoke-FirestoreBackupScheduleRest {
  param(
    [string]$ProjectId,
    [string]$DatabaseId,
    [string]$LocationId
  )

  $token = (& gcloud auth print-access-token 2>$null).Trim()
  if (-not $token) {
    return [pscustomobject]@{
      schedules = @()
      source = 'firestore-rest'
      status = 'unavailable'
      httpStatus = $null
    }
  }

  # Firestore documenta endpoint global y endpoints regionales del tipo
  # firestore.<region>.rep.googleapis.com. Probamos primero el regional de la
  # propia base para evitar fallos de ruteo del endpoint global observados en
  # Cloud SDK/REST; ambos intentos son exclusivamente GET.
  $hosts = @()
  if ($LocationId) {
    $hosts += "firestore.$LocationId.rep.googleapis.com"
  }
  $hosts += 'firestore.googleapis.com'

  $lastStatus = $null
  foreach ($hostName in @($hosts | Select-Object -Unique)) {
    # Database IDs de Firestore son segmentos de ruta; '(default)' es el ID
    # oficial para la base predeterminada y puede aparecer literalmente.
    $uri = "https://$hostName/v1/projects/$ProjectId/databases/$DatabaseId/backupSchedules"
    try {
      $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{
        Authorization = "Bearer $token"
      }
      $schedules = if ($null -eq $response.backupSchedules) { @() } else { @($response.backupSchedules) }
      return [pscustomobject]@{
        schedules = $schedules
        source = "firestore-rest:$hostName"
        status = 'ok'
        httpStatus = 200
      }
    } catch {
      $lastStatus = Get-HttpStatusCode $_
    }
  }

  # Que el endpoint de schedules no esté disponible no debe impedir observar
  # PITR, billing, budgets ni telemetría. El preflight reporta el probe como
  # unavailable sin inferir que no existan schedules.
  return [pscustomobject]@{
    schedules = @()
    source = 'firestore-rest'
    status = 'unavailable'
    httpStatus = $lastStatus
  }
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

$backupScheduleSource = 'gcloud'
$backupScheduleProbeStatus = 'ok'
$backupScheduleHttpStatus = $null
try {
  $backupSchedules = Invoke-GcloudJson @(
    'firestore', 'backups', 'schedules', 'list',
    "--database=$Database",
    "--project=$Project"
  )
} catch {
  $restProbe = Invoke-FirestoreBackupScheduleRest -ProjectId $Project -DatabaseId $Database -LocationId ([string]$database.locationId)
  $backupSchedules = @($restProbe.schedules)
  $backupScheduleSource = [string]$restProbe.source
  $backupScheduleProbeStatus = [string]$restProbe.status
  $backupScheduleHttpStatus = $restProbe.httpStatus
}

$billing = Invoke-GcloudJson @(
  'billing', 'projects', 'describe',
  $Project
)

$billingEnabled = [bool]$billing.billingEnabled
$budgetCount = $null
$billingAccountName = [string]$billing.billingAccountName
if ($billingEnabled -and $billingAccountName -match '^billingAccounts/(.+)$') {
  $billingAccountId = $Matches[1]
  try {
    $budgets = Invoke-GcloudJson @(
      'billing', 'budgets', 'list',
      "--billing-account=$billingAccountId"
    )
    $budgetCount = @($budgets).Count
  } catch {
    # El acceso a budgets puede requerir permisos adicionales; no bloquea el resto del preflight.
    $budgetCount = $null
  }
}

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
  backupScheduleProbeStatus = $backupScheduleProbeStatus
  backupScheduleHttpStatus = $backupScheduleHttpStatus
  backupScheduleCount = if ($backupScheduleProbeStatus -eq 'ok') { @($backupSchedules).Count } else { $null }
  backupScheduleSource = $backupScheduleSource
  backupSchedules = if ($backupScheduleProbeStatus -eq 'ok') { @($backupSchedules) } else { @() }
  billingEnabled = $billingEnabled
  budgetCount = $budgetCount
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
