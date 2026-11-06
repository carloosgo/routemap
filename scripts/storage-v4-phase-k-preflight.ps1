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

function Get-GcloudAccessToken {
  $token = (& gcloud auth print-access-token 2>$null).Trim()
  if (-not $token) { return $null }
  return $token
}

function Invoke-FirestoreBackupScheduleRest {
  param(
    [string]$ProjectId,
    [string]$DatabaseId,
    [string]$LocationId
  )

  $token = Get-GcloudAccessToken
  if (-not $token) {
    return [pscustomobject]@{
      schedules = @()
      source = 'firestore-rest'
      status = 'unavailable'
      httpStatus = $null
    }
  }

  $hosts = @()
  if ($LocationId) {
    $hosts += "firestore.$LocationId.rep.googleapis.com"
  }
  $hosts += 'firestore.googleapis.com'

  $lastStatus = $null
  foreach ($hostName in @($hosts | Select-Object -Unique)) {
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

  return [pscustomobject]@{
    schedules = @()
    source = 'firestore-rest'
    status = 'unavailable'
    httpStatus = $lastStatus
  }
}

function Invoke-ProjectBudgetRest {
  param(
    [string]$ProjectId,
    [string]$BillingAccountName
  )

  $token = Get-GcloudAccessToken
  if (-not $token -or -not $BillingAccountName -or $BillingAccountName -notmatch '^billingAccounts/') {
    return [pscustomobject]@{
      budgets = @()
      source = 'billing-rest-project-scope'
      status = 'unavailable'
      httpStatus = $null
    }
  }

  $scope = [Uri]::EscapeDataString("projects/$ProjectId")
  $budgets = @()
  $pageToken = ''

  try {
    do {
      $uri = "https://billingbudgets.googleapis.com/v1/$BillingAccountName/budgets?scope=$scope&pageSize=100"
      if ($pageToken) {
        $uri += "&pageToken=$([Uri]::EscapeDataString($pageToken))"
      }
      $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{
        Authorization = "Bearer $token"
        'x-goog-user-project' = $ProjectId
      }
      if ($null -ne $response.budgets) {
        $budgets += @($response.budgets)
      }
      $pageToken = [string]$response.nextPageToken
    } while ($pageToken)

    return [pscustomobject]@{
      budgets = @($budgets)
      source = 'billing-rest-project-scope'
      status = 'ok'
      httpStatus = 200
    }
  } catch {
    return [pscustomobject]@{
      budgets = @()
      source = 'billing-rest-project-scope'
      status = 'unavailable'
      httpStatus = Get-HttpStatusCode $_
    }
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
$billingAccountName = [string]$billing.billingAccountName
$budgetCount = $null
$budgetProbeStatus = if ($billingEnabled) { 'unavailable' } else { 'not-applicable' }
$budgetProbeSource = $null
$budgetProbeHttpStatus = $null
$accountBudgetCount = $null
$accountBudgetProbeStatus = if ($billingEnabled) { 'unavailable' } else { 'not-applicable' }

if ($billingEnabled -and $billingAccountName -match '^billingAccounts/(.+)$') {
  $billingAccountId = $Matches[1]

  try {
    $accountBudgets = Invoke-GcloudJson @(
      'billing', 'budgets', 'list',
      "--billing-account=$billingAccountId"
    )
    $accountBudgetCount = @($accountBudgets).Count
    $accountBudgetProbeStatus = 'ok'
  } catch {
    $accountBudgetProbeStatus = 'unavailable'
  }

  # budgetCount es deliberadamente project-scoped. Una cuenta de billing puede
  # contener budgets de dev y prod; el total de la cuenta no representa el
  # número de budgets que protegen atlasmap-dev.
  $projectBudgetProbe = Invoke-ProjectBudgetRest -ProjectId $Project -BillingAccountName $billingAccountName
  $budgetProbeStatus = [string]$projectBudgetProbe.status
  $budgetProbeSource = [string]$projectBudgetProbe.source
  $budgetProbeHttpStatus = $projectBudgetProbe.httpStatus
  if ($budgetProbeStatus -eq 'ok') {
    $budgetCount = @($projectBudgetProbe.budgets).Count
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
  budgetProbeStatus = $budgetProbeStatus
  budgetProbeSource = $budgetProbeSource
  budgetProbeHttpStatus = $budgetProbeHttpStatus
  budgetCountScope = 'project'
  budgetCount = $budgetCount
  accountBudgetProbeStatus = $accountBudgetProbeStatus
  accountBudgetCount = $accountBudgetCount
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
