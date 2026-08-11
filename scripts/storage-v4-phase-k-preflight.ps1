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

function Invoke-FirestoreBackupScheduleRest {
  param(
    [string]$ProjectId,
    [string]$DatabaseId
  )

  $token = (& gcloud auth print-access-token 2>$null).Trim()
  if (-not $token) {
    throw 'No se pudo obtener un access token de gcloud para consultar backup schedules.'
  }

  $encodedProject = [Uri]::EscapeDataString($ProjectId)
  $encodedDatabase = [Uri]::EscapeDataString($DatabaseId)
  $uri = "https://firestore.googleapis.com/v1/projects/$encodedProject/databases/$encodedDatabase/backupSchedules"

  try {
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{
      Authorization = "Bearer $token"
    }
  } catch {
    throw "Firestore BackupSchedule REST fallo: $($_.Exception.Message)"
  }

  if ($null -eq $response.backupSchedules) { return @() }
  return @($response.backupSchedules)
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
try {
  $backupSchedules = Invoke-GcloudJson @(
    'firestore', 'backups', 'schedules', 'list',
    "--database=$Database",
    "--project=$Project"
  )
} catch {
  if ($_.Exception.Message -notmatch 'HTTPError 404') { throw }
  # Cloud SDK 580 puede devolver 404 HTML en este subcomando aunque la API REST
  # de Firestore exponga el recurso. El fallback sigue siendo estrictamente GET.
  $backupSchedules = Invoke-FirestoreBackupScheduleRest -ProjectId $Project -DatabaseId $Database
  $backupScheduleSource = 'firestore-rest'
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
  backupScheduleCount = @($backupSchedules).Count
  backupScheduleSource = $backupScheduleSource
  backupSchedules = @($backupSchedules)
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
