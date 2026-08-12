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

function Invoke-MonitoringNotificationChannelProbe {
  param([string]$ProjectId)

  $token = Get-GcloudAccessToken
  if (-not $token) {
    return [pscustomobject]@{
      status = 'unavailable'
      httpStatus = $null
      data = @()
    }
  }

  $channels = @()
  $pageToken = $null

  try {
    do {
      $uri = "https://monitoring.googleapis.com/v3/projects/$ProjectId/notificationChannels"
      if ($pageToken) {
        $encodedPageToken = [Uri]::EscapeDataString([string]$pageToken)
        $uri = "${uri}?pageToken=$encodedPageToken"
      }

      $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{
        Authorization = "Bearer $token"
        'x-goog-user-project' = $ProjectId
      }

      if ($null -ne $response.notificationChannels) {
        $channels += @($response.notificationChannels)
      }
      $pageToken = [string]$response.nextPageToken
    } while ($pageToken)

    return [pscustomobject]@{
      status = 'ok'
      httpStatus = 200
      data = @($channels)
    }
  } catch {
    return [pscustomobject]@{
      status = 'unavailable'
      httpStatus = Get-HttpStatusCode $_
      data = @()
    }
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

$channelProbe = Invoke-MonitoringNotificationChannelProbe -ProjectId $Project
$notificationChannels = @($channelProbe.data)
$enabledVerifiedChannels = @($notificationChannels | Where-Object {
  [bool]$_.enabled -and [string]$_.verificationStatus -eq 'VERIFIED'
})
$enabledUsableChannels = @($notificationChannels | Where-Object {
  [bool]$_.enabled -and [string]$_.verificationStatus -ne 'UNVERIFIED'
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
  notificationChannelProbeHttpStatus = $channelProbe.httpStatus
  notificationChannelTransport = 'monitoring-rest-v3'
  notificationChannelCount = $notificationChannels.Count
  enabledVerifiedNotificationChannelCount = $enabledVerifiedChannels.Count
  enabledUsableNotificationChannelCount = $enabledUsableChannels.Count
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
