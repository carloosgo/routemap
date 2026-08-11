param(
  [string]$Project = 'atlasmap-dev',
  [string]$DatabaseId = '(default)',
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
  # propia base; ambos intentos son exclusivamente GET.
  $hosts = @()
  if ($LocationId) {
    $hosts += "firestore.$LocationId.rep.googleapis.com"
  }
  $hosts += 'firestore.googleapis.com'

  $lastStatus = $null
  foreach ($hostName in @($hosts | Select-Object -Unique)) {
    # '(default)' es el ID oficial de la base predeterminada de Firestore.
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
  # PITR, billing, budgets ni telemetría. No inferimos que no existan schedules.
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

# PowerShell no distingue mayúsculas/minúsculas en nombres de variables.
# Mantener DatabaseId (string de entrada) separado de databaseInfo (respuesta)
# evita sobrescribir el ID '(default)' con el objeto devuelto por gcloud.
$databaseInfo = Invoke-GcloudJson @(
  'firestore', 'databases', 'describe',
  "--database=$DatabaseId",
  "--project=$Project"
)

$backupScheduleSource = 'gcloud'
$backupScheduleProbeStatus = 'ok'
$backupScheduleHttpStatus = $null
try {
  $backupSchedules = Invoke-GcloudJson @(
    'firestore', 'backups', 'schedules', 'list',
    "--database=$DatabaseId",
    "--project=$Project"
  )
} catch {
  $restProbe = Invoke-FirestoreBackupScheduleRest -ProjectId $Project -DatabaseId $DatabaseId -LocationId ([string]$databaseInfo.locationId)
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
  database = $DatabaseId
  activeAccountPresent = $true
  locationId = $databaseInfo.locationId
  pointInTimeRecoveryEnablement = $databaseInfo.pointInTimeRecoveryEnablement
  versionRetentionPeriod = $databaseInfo.versionRetentionPeriod
  earliestVersionTime = $databaseInfo.earliestVersionTime
  deleteProtectionState = $databaseInfo.deleteProtectionState
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
