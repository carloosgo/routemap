param(
  [string]$Project = 'atlasmap-dev'
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este preflight esta bloqueado deliberadamente a atlasmap-dev.'
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$activeAccount = (& gcloud config get-value account 2>$null).Trim()
if (-not $activeAccount -or $activeAccount -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

function Invoke-GcloudJsonProbe {
  param([string[]]$Arguments)

  $rawOutput = & gcloud @Arguments --format=json 2>&1
  if ($LASTEXITCODE -ne 0) {
    return [pscustomobject]@{
      status = 'unavailable'
      data = @()
    }
  }

  $text = ($rawOutput -join [Environment]::NewLine).Trim()
  $parsed = if ($text) { @($text | ConvertFrom-Json) } else { @() }
  return [pscustomobject]@{
    status = 'ok'
    data = @($parsed)
  }
}

$dashboardProbe = Invoke-GcloudJsonProbe @(
  'monitoring', 'dashboards', 'list',
  "--project=$Project"
)
$atlasDashboards = @($dashboardProbe.data | Where-Object {
  [string]$_.labels.system -eq 'atlas-storage-v4' -and
  [string]$_.labels.environment -eq 'dev'
})

$policyProbe = Invoke-GcloudJsonProbe @(
  'monitoring', 'policies', 'list',
  "--project=$Project"
)
$atlasPolicies = @($policyProbe.data | Where-Object {
  [string]$_.userLabels.system -eq 'atlas-storage-v4' -and
  [string]$_.userLabels.environment -eq 'dev' -and
  [string]$_.userLabels.phase -eq 'k'
})

$metricProbe = Invoke-GcloudJsonProbe @(
  'logging', 'metrics', 'list',
  "--project=$Project"
)
$atlasMetrics = @($metricProbe.data | Where-Object {
  [string]$_.name -like 'atlas_storage_v4_*'
})

$channelProbe = Invoke-GcloudJsonProbe @(
  'beta', 'monitoring', 'channels', 'list',
  "--project=$Project"
)
$notificationChannels = @($channelProbe.data)
$enabledVerifiedChannels = @($notificationChannels | Where-Object {
  [bool]$_.enabled -and [string]$_.verificationStatus -eq 'VERIFIED'
})

[ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  activeAccountPresent = $true
  dashboardProbeStatus = [string]$dashboardProbe.status
  atlasDashboardCount = $atlasDashboards.Count
  atlasDashboards = @($atlasDashboards | ForEach-Object {
    [ordered]@{
      name = [string]$_.name
      displayName = [string]$_.displayName
    }
  })
  alertPolicyProbeStatus = [string]$policyProbe.status
  atlasAlertPolicyCount = $atlasPolicies.Count
  atlasAlertPolicies = @($atlasPolicies | ForEach-Object {
    $policyChannels = @($_.notificationChannels)
    [ordered]@{
      name = [string]$_.name
      displayName = [string]$_.displayName
      enabled = [bool]$_.enabled
      notificationChannelCount = $policyChannels.Count
      notificationChannels = @($policyChannels | ForEach-Object { [string]$_ })
    }
  })
  logMetricProbeStatus = [string]$metricProbe.status
  atlasLogMetricCount = $atlasMetrics.Count
  atlasLogMetrics = @($atlasMetrics | ForEach-Object {
    [ordered]@{
      name = [string]$_.name
      disabled = [bool]$_.disabled
    }
  })
  notificationChannelProbeStatus = [string]$channelProbe.status
  notificationChannelCount = $notificationChannels.Count
  enabledVerifiedNotificationChannelCount = $enabledVerifiedChannels.Count
  notificationChannels = @($notificationChannels | ForEach-Object {
    [ordered]@{
      name = [string]$_.name
      displayName = [string]$_.displayName
      type = [string]$_.type
      enabled = [bool]$_.enabled
      verificationStatus = [string]$_.verificationStatus
    }
  })
  mutatesCloud = $false
  activatesAlertPolicies = $false
  touchesProduction = $false
} | ConvertTo-Json -Depth 8
