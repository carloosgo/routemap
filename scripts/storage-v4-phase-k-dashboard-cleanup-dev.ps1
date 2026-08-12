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

$listed = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project"))
$details = @()
foreach ($dashboard in $listed) {
  $id = DashboardId $dashboard
  if (-not $id) { continue }
  $detail = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'describe', $id, "--project=$Project")) | Select-Object -First 1
  if ($detail -and (Is-AtlasDevDashboard $detail)) {
    $details += $detail
  }
}

$plan = [ordered]@{
  project = $Project
  applyRequested = [bool]$Apply
  preferredDashboardId = if ($PreferredDashboardId) { $PreferredDashboardId } else { $null }
  atlasDashboardCount = $details.Count
  atlasDashboardIds = @($details | ForEach-Object { DashboardId $_ } | Sort-Object)
  deletesExactlyOneDashboard = [bool]$Apply
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

if ($details.Count -ne 2) {
  throw 'El cleanup solo opera cuando detecta exactamente dos dashboards Atlas dev por labels o firma de contenido.'
}

$normalized = @($details | ForEach-Object { Normalize-DashboardForComparison $_ })
if ($normalized.Count -ne 2 -or $normalized[0] -ne $normalized[1]) {
  throw 'Los dos dashboards no son equivalentes despues de normalizar campos server-owned; no se elimina ninguno.'
}

$ids = @($details | ForEach-Object { DashboardId $_ } | Sort-Object)
$keepId = if ($PreferredDashboardId -and $ids -contains $PreferredDashboardId) {
  $PreferredDashboardId
} else {
  $ids[0]
}
$duplicateId = @($ids | Where-Object { $_ -ne $keepId }) | Select-Object -First 1

if (-not $duplicateId) {
  throw 'No se pudo determinar de forma segura el dashboard duplicado; cleanup abortado.'
}

& gcloud monitoring dashboards delete $duplicateId "--project=$Project" --quiet
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo eliminar el dashboard duplicado $duplicateId."
}

$remainingListed = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project"))
$remainingAtlas = @()
foreach ($dashboard in $remainingListed) {
  $id = DashboardId $dashboard
  if (-not $id) { continue }
  $detail = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'describe', $id, "--project=$Project")) | Select-Object -First 1
  if ($detail -and (Is-AtlasDevDashboard $detail)) {
    $remainingAtlas += $detail
  }
}
if ($remainingAtlas.Count -ne 1 -or (DashboardId $remainingAtlas[0]) -ne $keepId) {
  throw 'Post-check invalido: no quedo exactamente el dashboard Atlas dev esperado.'
}

[ordered]@{
  project = $Project
  applied = $true
  keptDashboardId = $keepId
  deletedDashboardId = $duplicateId
  remainingAtlasDashboardCount = $remainingAtlas.Count
  alertPoliciesUntouched = $true
  logMetricsUntouched = $true
  budgetsUntouched = $true
  storageV4WriteUnchanged = $true
  productionUntouched = $true
} | ConvertTo-Json -Depth 6
