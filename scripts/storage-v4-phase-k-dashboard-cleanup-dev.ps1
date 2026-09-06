param(
  [string]$Project = 'atlasmap-dev',
  [string]$PreferredDashboardId = '',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este cleanup esta bloqueado deliberadamente a atlasmap-dev.'
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$activeAccount = (& gcloud config get-value account 2>$null).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

$accessToken = (& gcloud auth print-access-token 2>$null).Trim()
if (-not $accessToken) {
  throw 'No se pudo obtener un access token de la cuenta activa de gcloud.'
}

$monitoringHeaders = @{
  Authorization = "Bearer $accessToken"
  'x-goog-user-project' = $Project
}

function Invoke-MonitoringRestGet {
  param([string]$Uri)

  try {
    return Invoke-RestMethod -Method Get -Uri $Uri -Headers $monitoringHeaders
  } catch {
    throw "Monitoring REST GET fallo para $Uri : $($_.Exception.Message)"
  }
}

function Get-MonitoringDashboards {
  $dashboards = @()
  $pageToken = $null

  do {
    $uri = "https://monitoring.googleapis.com/v1/projects/$Project/dashboards"
    if ($pageToken) {
      $encodedPageToken = [Uri]::EscapeDataString([string]$pageToken)
      $uri = "${uri}?pageToken=$encodedPageToken"
    }

    $response = Invoke-MonitoringRestGet -Uri $uri
    if ($null -ne $response.dashboards) {
      $dashboards += @($response.dashboards)
    }
    $pageToken = [string]$response.nextPageToken
  } while ($pageToken)

  return @($dashboards)
}

function Get-MonitoringDashboardDetail {
  param($Dashboard)

  $resourceName = [string]$Dashboard.name
  if (-not $resourceName) {
    throw 'Monitoring devolvio un dashboard sin resource name; cleanup abortado.'
  }
  return Invoke-MonitoringRestGet -Uri "https://monitoring.googleapis.com/v1/$resourceName"
}

function Remove-MonitoringDashboard {
  param([string]$ResourceName)

  if (-not $ResourceName -or $ResourceName -notmatch '^projects/[^/]+/dashboards/[A-Za-z0-9_-]+$') {
    throw 'Resource name de dashboard invalido; delete abortado.'
  }

  $uri = "https://monitoring.googleapis.com/v1/$ResourceName"
  try {
    $null = Invoke-RestMethod -Method Delete -Uri $uri -Headers $monitoringHeaders
  } catch {
    throw "Monitoring REST DELETE fallo para $ResourceName : $($_.Exception.Message)"
  }
}

function DashboardId {
  param($Dashboard)
  return (([string]$Dashboard.name -split '/')[-1])
}

function Is-AtlasDevDashboard {
  param($Dashboard)

  $hasLabels = (
    [string]$Dashboard.labels.system -eq 'atlas-storage-v4' -and
    [string]$Dashboard.labels.environment -eq 'dev'
  )
  if ($hasLabels) { return $true }

  $serialized = $Dashboard | ConvertTo-Json -Depth 100 -Compress
  $requiredMarkers = @(
    'storage_v4_rollout_metric',
    'storage_v4_sync_metric',
    'storage_v4_provider_cache_metric',
    'storage_v4_provider_request_metric',
    'atlas_storage_v4_rollout_events',
    'atlas_storage_v4_sync_events'
  )
  foreach ($marker in $requiredMarkers) {
    if (-not $serialized.Contains($marker)) { return $false }
  }
  return $true
}

function Normalize-DashboardForComparison {
  param($Dashboard)
  $copy = $Dashboard | ConvertTo-Json -Depth 100 | ConvertFrom-Json
  foreach ($property in @('name', 'etag', 'displayName', 'labels')) {
    if ($copy.PSObject.Properties.Name -contains $property) {
      $copy.PSObject.Properties.Remove($property)
    }
  }
  return ($copy | ConvertTo-Json -Depth 100 -Compress)
}

function Get-AtlasDashboardDetails {
  $listed = @(Get-MonitoringDashboards)
  $details = @()

  foreach ($dashboard in $listed) {
    $detail = Get-MonitoringDashboardDetail -Dashboard $dashboard
    if ($detail -and (Is-AtlasDevDashboard $detail)) {
      $details += $detail
    }
  }

  return @($details)
}

$details = @(Get-AtlasDashboardDetails)
$ids = @($details | ForEach-Object { DashboardId $_ } | Sort-Object)

$plan = [ordered]@{
  project = $Project
  applyRequested = [bool]$Apply
  transport = 'monitoring-rest-v1'
  preferredDashboardId = if ($PreferredDashboardId) { $PreferredDashboardId } else { $null }
  atlasDashboardCount = $details.Count
  atlasDashboardIds = $ids
  deletesExactlyOneDashboard = [bool]($Apply -and $details.Count -eq 2)
  alreadyClean = [bool]($details.Count -eq 1)
  deletesAlertPolicies = $false
  deletesLogMetrics = $false
  mutatesBudgets = $false
  enablesStorageV4Write = $false
  touchesProduction = $false
}
$plan | ConvertTo-Json -Depth 6

if (-not $Apply) {
  Write-Output 'Dry-run: no se elimino ningun dashboard.'
  exit 0
}

if ($details.Count -eq 1) {
  $existingId = DashboardId $details[0]
  if ($PreferredDashboardId -and $existingId -ne $PreferredDashboardId) {
    throw "El unico dashboard Atlas dev no coincide con el ID preferido solicitado ($PreferredDashboardId); cleanup abortado."
  }

  [ordered]@{
    project = $Project
    applied = $true
    cleanupNeeded = $false
    alreadyClean = $true
    transport = 'monitoring-rest-v1'
    keptDashboardId = $existingId
    deletedDashboardId = $null
    remainingAtlasDashboardCount = 1
    alertPoliciesUntouched = $true
    logMetricsUntouched = $true
    budgetsUntouched = $true
    storageV4WriteUnchanged = $true
    productionUntouched = $true
  } | ConvertTo-Json -Depth 6
  Write-Output 'Dashboard cleanup: ya existe exactamente un dashboard Atlas dev; no hay duplicado que eliminar.'
  exit 0
}

if ($details.Count -ne 2) {
  throw "El cleanup requiere uno o dos dashboards Atlas dev y Monitoring REST detecto $($details.Count); no se elimina ninguno."
}

$normalized = @($details | ForEach-Object { Normalize-DashboardForComparison $_ })
if ($normalized.Count -ne 2 -or $normalized[0] -ne $normalized[1]) {
  throw 'Los dos dashboards no son equivalentes despues de normalizar campos server-owned; no se elimina ninguno.'
}

if ($PreferredDashboardId -and $ids -notcontains $PreferredDashboardId) {
  throw "El dashboard preferido $PreferredDashboardId no aparece entre los dos candidatos validados; no se elimina ninguno."
}

$keepId = if ($PreferredDashboardId) { $PreferredDashboardId } else { $ids[0] }
$duplicate = @($details | Where-Object { (DashboardId $_) -ne $keepId }) | Select-Object -First 1
$duplicateId = if ($duplicate) { DashboardId $duplicate } else { $null }
$duplicateResourceName = if ($duplicate) { [string]$duplicate.name } else { $null }

if (-not $duplicateId -or -not $duplicateResourceName) {
  throw 'No se pudo determinar de forma segura el dashboard duplicado; cleanup abortado.'
}

Remove-MonitoringDashboard -ResourceName $duplicateResourceName

$remainingAtlas = @(Get-AtlasDashboardDetails)
if ($remainingAtlas.Count -ne 1 -or (DashboardId $remainingAtlas[0]) -ne $keepId) {
  throw 'Post-check invalido: no quedo exactamente el dashboard Atlas dev esperado.'
}

[ordered]@{
  project = $Project
  applied = $true
  cleanupNeeded = $true
  alreadyClean = $false
  transport = 'monitoring-rest-v1'
  keptDashboardId = $keepId
  deletedDashboardId = $duplicateId
  remainingAtlasDashboardCount = $remainingAtlas.Count
  alertPoliciesUntouched = $true
  logMetricsUntouched = $true
  budgetsUntouched = $true
  storageV4WriteUnchanged = $true
  productionUntouched = $true
} | ConvertTo-Json -Depth 6
