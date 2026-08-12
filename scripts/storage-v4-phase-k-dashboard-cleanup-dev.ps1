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
  return (
    [string]$Dashboard.labels.system -eq 'atlas-storage-v4' -and
    [string]$Dashboard.labels.environment -eq 'dev'
  )
}

function Normalize-DashboardForComparison {
  param($Dashboard)
  $copy = $Dashboard | ConvertTo-Json -Depth 100 | ConvertFrom-Json
  foreach ($property in @('name', 'etag', 'displayName')) {
    if ($copy.PSObject.Properties.Name -contains $property) {
      $copy.PSObject.Properties.Remove($property)
    }
  }
  return ($copy | ConvertTo-Json -Depth 100 -Compress)
}

$dashboards = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project"))
$atlasDashboards = @($dashboards | Where-Object { Is-AtlasDevDashboard $_ })

$plan = [ordered]@{
  project = $Project
  applyRequested = [bool]$Apply
  preferredDashboardId = if ($PreferredDashboardId) { $PreferredDashboardId } else { $null }
  atlasDashboardCount = $atlasDashboards.Count
  atlasDashboardIds = @($atlasDashboards | ForEach-Object { DashboardId $_ } | Sort-Object)
  deletesExactlyOneDashboard = $Apply
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

if ($atlasDashboards.Count -ne 2) {
  throw 'El cleanup solo opera cuando existen exactamente dos dashboards Atlas dev.'
}

$details = @()
foreach ($dashboard in $atlasDashboards) {
  $id = DashboardId $dashboard
  $detail = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'describe', $id, "--project=$Project")) | Select-Object -First 1
  if (-not (Is-AtlasDevDashboard $detail)) {
    throw "El dashboard $id ya no cumple los labels Atlas dev esperados; cleanup abortado."
  }
  $details += $detail
}

$normalized = @($details | ForEach-Object { Normalize-DashboardForComparison $_ })
if ($normalized.Count -ne 2 -or $normalized[0] -ne $normalized[1]) {
  throw 'Los dos dashboards no son equivalentes despues de normalizar campos server-owned; no se elimina ninguno.'
}

$ids = @($details | ForEach-Object { DashboardId $_ } | Sort-Object)
$keepId = $null
if ($PreferredDashboardId -and $ids -contains $PreferredDashboardId) {
  $keepId = $PreferredDashboardId
} else {
  $keepId = $ids[0]
}
$duplicateId = @($ids | Where-Object { $_ -ne $keepId }) | Select-Object -First 1

if (-not $duplicateId) {
  throw 'No se pudo determinar de forma segura el dashboard duplicado; cleanup abortado.'
}

& gcloud monitoring dashboards delete $duplicateId "--project=$Project" --quiet
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo eliminar el dashboard duplicado $duplicateId."
}

$remaining = @(Invoke-GcloudJson @('monitoring', 'dashboards', 'list', "--project=$Project"))
$remainingAtlas = @($remaining | Where-Object { Is-AtlasDevDashboard $_ })
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
