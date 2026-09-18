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

# Windows PowerShell 5 no interpreta de forma fiable UTF-8 sin BOM usando el default.
# Todos los JSON del bundle se leen explicitamente como UTF-8 para no corromper displayName.
$metricPlans = @($metricFiles | ForEach-Object {
  $config = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  [ordered]@{ name = [string]$config.name; file = $_.Name }
})
$alertPlans = @($alertFiles | ForEach-Object {
  $config = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  $conditionFilter = [string]$config.conditions[0].conditionThreshold.filter
  $metricType = ''
  if ($conditionFilter -match 'metric\.type=\"([^\"]+)\"') {
    $metricType = [string]$Matches[1]
  }
  [ordered]@{
    displayName = [string]$config.displayName
    file = $_.Name
    enabled = [bool]$config.enabled
    metricType = $metricType
  }
})
$dashboardConfig = Get-Content $dashboardFile -Raw -Encoding UTF8 | ConvertFrom-Json

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

function Get-LogMetricNames {
  $metrics = Invoke-GcloudJson @('logging', 'metrics', 'list', "--project=$Project")
  return @($metrics | ForEach-Object { [string]$_.name })
}

function Test-AtlasDashboard {
  param($Dashboard)
  return (
    [string]$Dashboard.labels.system -eq 'atlas-storage-v4' -and
    [string]$Dashboard.labels.environment -eq 'dev'
  )
}

function Test-AtlasAlertPolicyMatch {
  param(
    $Policy,
    [string]$MetricType
  )
  if ([string]$Policy.userLabels.system -ne 'atlas-storage-v4') { return $false }
  if ([string]$Policy.userLabels.environment -ne 'dev') { return $false }
  if ([string]$Policy.userLabels.phase -ne 'k') { return $false }
  if (-not $MetricType) { return $false }

  $filters = @($Policy.conditions | ForEach-Object {
    [string]$_.conditionThreshold.filter
  })
  return @($filters | Where-Object { $_ -like "*$MetricType*" }).Count -gt 0
}

# Fail-fast antes de cualquier mutacion si ya existe drift del dashboard.
$preApplyDashboards = Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project")
$preApplyMatchingDashboards = @($preApplyDashboards | Where-Object { Test-AtlasDashboard $_ })
if ($preApplyMatchingDashboards.Count -gt 1) {
  throw "Observability apply abortado: se esperaba como maximo un dashboard Atlas dev y se detectaron $($preApplyMatchingDashboards.Count). Ejecuta primero el cleanup explicito."
}

# No usar `gcloud logging metrics describe` como prueba de existencia en Windows
# PowerShell: un NOT_FOUND se materializa como ErrorRecord antes de que podamos
# inspeccionar LASTEXITCODE bajo ErrorActionPreference=Stop. Listar es read-only y
# permite tratar una metrica ausente como estado normal del primer apply.
$knownMetricNames = @(Get-LogMetricNames)
$createdMetrics = @()
$existingMetrics = @()
foreach ($metricFile in $metricFiles) {
  $metricConfig = Get-Content $metricFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  $metricName = [string]$metricConfig.name
  if ($knownMetricNames -contains $metricName) {
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
  $knownMetricNames += $metricName
}

Invoke-Gcloud @(
  'monitoring', 'dashboards', 'create',
  "--config-from-file=$dashboardFile",
  "--project=$Project",
  '--validate-only',
  '--quiet'
)

$dashboardDisplayName = [string]$dashboardConfig.displayName
# displayName puede sufrir mojibake al volver por Windows PowerShell 5. La identidad
# estable del recurso es el par de labels ASCII controlados por este bundle.
$matchingDashboards = @($preApplyMatchingDashboards)
$dashboardExists = $matchingDashboards.Count -eq 1
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
foreach ($plan in $alertPlans) {
  $matches = @($policies | Where-Object {
    Test-AtlasAlertPolicyMatch $_ ([string]$plan.metricType)
  })
  if ($matches.Count -gt 0) {
    $existingPolicies += [string]$plan.displayName
    continue
  }

  $alertFile = $alertFiles | Where-Object { $_.Name -eq [string]$plan.file } | Select-Object -First 1
  if (-not $alertFile) { throw "No se encontro el template esperado: $($plan.file)" }
  Invoke-Gcloud @(
    'monitoring', 'policies', 'create',
    "--policy-from-file=$($alertFile.FullName)",
    "--project=$Project",
    '--quiet'
  )
  $createdPolicies += [string]$plan.displayName
}

# Post-apply verification: do not trust local config or successful create commands alone.
$verifiedMetricNames = @(Get-LogMetricNames)
$verifiedMetrics = @()
foreach ($plan in $metricPlans) {
  if ($verifiedMetricNames -notcontains [string]$plan.name) {
    throw "La metrica esperada no aparece despues del apply: $($plan.name)"
  }
  $verifiedMetrics += [string]$plan.name
}

$verifiedDashboards = Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project")
$matchingDashboards = @($verifiedDashboards | Where-Object { Test-AtlasDashboard $_ })
if ($matchingDashboards.Count -ne 1) {
  throw "Post-check invalido: se esperaba exactamente un dashboard Atlas Storage v4 dev y se detectaron $($matchingDashboards.Count)."
}

$verifiedPolicies = Invoke-GcloudJson @('monitoring', 'policies', 'list', "--project=$Project")
$policyVerification = @()
foreach ($plan in $alertPlans) {
  $matches = @($verifiedPolicies | Where-Object {
    Test-AtlasAlertPolicyMatch $_ ([string]$plan.metricType)
  })
  if ($matches.Count -lt 1) {
    throw "La alert policy esperada no aparece despues del apply para metrica: $($plan.metricType)"
  }
  $enabledMatches = @($matches | Where-Object { [bool]$_.enabled })
  if ($enabledMatches.Count -gt 0) {
    throw "La alert policy quedo habilitada inesperadamente para metrica: $($plan.metricType)"
  }
  $policyVerification += [ordered]@{
    displayName = [string]$plan.displayName
    metricType = [string]$plan.metricType
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
  dashboardVerified = $matchingDashboards.Count -eq 1
  dashboardMatchCount = $matchingDashboards.Count
  createdAlertPolicies = $createdPolicies
  existingAlertPolicies = $existingPolicies
  alertPolicyVerification = $policyVerification
  allAlertPoliciesVerifiedDisabled = @($policyVerification | Where-Object { -not $_.allDisabled }).Count -eq 0
  alertPoliciesRemainDisabledByConfig = $true
  budgetUnchanged = $true
  storageV4WriteUnchanged = $true
  productionUntouched = $true
} | ConvertTo-Json -Depth 8
