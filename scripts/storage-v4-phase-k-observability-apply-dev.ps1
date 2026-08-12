param(
  [string]$Project = 'atlasmap-dev',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este apply esta bloqueado deliberadamente a atlasmap-dev.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$observabilityRoot = Join-Path $repoRoot 'ops/storage-v4/observability'
$metricsRoot = Join-Path $observabilityRoot 'metrics'
$alertsRoot = Join-Path $observabilityRoot 'alerts'
$dashboardFile = Join-Path $observabilityRoot 'dashboard.json'

$metricFiles = @(Get-ChildItem -Path $metricsRoot -Filter '*.json' -File | Sort-Object Name)
$alertFiles = @(Get-ChildItem -Path $alertsRoot -Filter '*.json' -File | Sort-Object Name)

if ($metricFiles.Count -eq 0) { throw 'No se encontraron configs de log-based metrics.' }
if ($alertFiles.Count -eq 0) { throw 'No se encontraron templates de alertas.' }
if (-not (Test-Path $dashboardFile)) { throw 'No se encontro dashboard.json.' }

$metricPlans = @($metricFiles | ForEach-Object {
  $config = Get-Content $_.FullName -Raw | ConvertFrom-Json
  [ordered]@{ name = [string]$config.name; file = $_.Name }
})
$alertPlans = @($alertFiles | ForEach-Object {
  $config = Get-Content $_.FullName -Raw | ConvertFrom-Json
  [ordered]@{ displayName = [string]$config.displayName; file = $_.Name; enabled = [bool]$config.enabled }
})
$dashboardConfig = Get-Content $dashboardFile -Raw | ConvertFrom-Json

[ordered]@{
  project = $Project
  applyRequested = [bool]$Apply
  purpose = 'Phase K observability resources in dev only'
  enablesStorageV4Write = $false
  touchesProduction = $false
  mutatesBudgets = $false
  deletesResources = $false
  metrics = $metricPlans
  dashboard = [ordered]@{ displayName = [string]$dashboardConfig.displayName; file = 'dashboard.json' }
  alertPolicies = $alertPlans
} | ConvertTo-Json -Depth 8

if (-not $Apply) {
  Write-Output 'Dry-run local: no se hizo ninguna llamada mutante a Google Cloud. Usa -Apply solo para el checkpoint cloud controlado.'
  exit 0
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$activeAccount = (& gcloud config get-value account 2>$null).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

function Invoke-Gcloud {
  param([string[]]$Arguments)
  & gcloud @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "gcloud fallo: $($Arguments -join ' ')"
  }
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

function Test-LogMetricExists {
  param([string]$MetricName)
  $null = & gcloud logging metrics describe $MetricName "--project=$Project" --format=json 2>$null
  return $LASTEXITCODE -eq 0
}

$createdMetrics = @()
$existingMetrics = @()
foreach ($metricFile in $metricFiles) {
  $metricConfig = Get-Content $metricFile.FullName -Raw | ConvertFrom-Json
  $metricName = [string]$metricConfig.name
  if (Test-LogMetricExists -MetricName $metricName) {
    $existingMetrics += $metricName
    continue
  }

  Invoke-Gcloud @(
    'logging', 'metrics', 'create', $metricName,
    "--config-from-file=$($metricFile.FullName)",
    "--project=$Project",
    '--quiet'
  )
  $createdMetrics += $metricName
}

Invoke-Gcloud @(
  'monitoring', 'dashboards', 'create',
  "--config-from-file=$dashboardFile",
  "--project=$Project",
  '--validate-only',
  '--quiet'
)

$dashboards = Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project")
$dashboardDisplayName = [string]$dashboardConfig.displayName
$dashboardExists = @($dashboards | Where-Object { [string]$_.displayName -eq $dashboardDisplayName }).Count -gt 0
$dashboardCreated = $false
if (-not $dashboardExists) {
  Invoke-Gcloud @(
    'monitoring', 'dashboards', 'create',
    "--config-from-file=$dashboardFile",
    "--project=$Project",
    '--quiet'
  )
  $dashboardCreated = $true
}

$policies = Invoke-GcloudJson @('monitoring', 'policies', 'list', "--project=$Project")
$createdPolicies = @()
$existingPolicies = @()
foreach ($alertFile in $alertFiles) {
  $alertConfig = Get-Content $alertFile.FullName -Raw | ConvertFrom-Json
  $displayName = [string]$alertConfig.displayName
  if (@($policies | Where-Object { [string]$_.displayName -eq $displayName }).Count -gt 0) {
    $existingPolicies += $displayName
    continue
  }

  Invoke-Gcloud @(
    'monitoring', 'policies', 'create',
    "--policy-from-file=$($alertFile.FullName)",
    "--project=$Project",
    '--quiet'
  )
  $createdPolicies += $displayName
}

# Post-apply verification: do not trust local config or successful create commands alone.
$verifiedMetrics = @()
foreach ($plan in $metricPlans) {
  if (-not (Test-LogMetricExists -MetricName ([string]$plan.name))) {
    throw "La metrica esperada no aparece despues del apply: $($plan.name)"
  }
  $verifiedMetrics += [string]$plan.name
}

$verifiedDashboards = Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project")
$matchingDashboards = @($verifiedDashboards | Where-Object {
  [string]$_.displayName -eq $dashboardDisplayName
})
if ($matchingDashboards.Count -lt 1) {
  throw "El dashboard esperado no aparece despues del apply: $dashboardDisplayName"
}

$verifiedPolicies = Invoke-GcloudJson @('monitoring', 'policies', 'list', "--project=$Project")
$policyVerification = @()
foreach ($plan in $alertPlans) {
  $matches = @($verifiedPolicies | Where-Object {
    [string]$_.displayName -eq [string]$plan.displayName
  })
  if ($matches.Count -lt 1) {
    throw "La alert policy esperada no aparece despues del apply: $($plan.displayName)"
  }
  $enabledMatches = @($matches | Where-Object { [bool]$_.enabled })
  if ($enabledMatches.Count -gt 0) {
    throw "La alert policy quedo habilitada inesperadamente: $($plan.displayName)"
  }
  $policyVerification += [ordered]@{
    displayName = [string]$plan.displayName
    foundCount = $matches.Count
    allDisabled = $true
  }
}

[ordered]@{
  project = $Project
  applied = $true
  createdMetrics = $createdMetrics
  existingMetrics = $existingMetrics
  verifiedMetrics = $verifiedMetrics
  allMetricsVerified = $verifiedMetrics.Count -eq $metricPlans.Count
  dashboardDisplayName = $dashboardDisplayName
  dashboardCreated = $dashboardCreated
  dashboardAlreadyExisted = $dashboardExists
  dashboardVerified = $matchingDashboards.Count -gt 0
  createdAlertPolicies = $createdPolicies
  existingAlertPolicies = $existingPolicies
  alertPolicyVerification = $policyVerification
  allAlertPoliciesVerifiedDisabled = @($policyVerification | Where-Object { -not $_.allDisabled }).Count -eq 0
  alertPoliciesRemainDisabledByConfig = $true
  budgetUnchanged = $true
  storageV4WriteUnchanged = $true
  productionUntouched = $true
} | ConvertTo-Json -Depth 8
