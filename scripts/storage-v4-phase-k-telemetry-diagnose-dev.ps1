param(
  [string]$Project = 'atlasmap-dev',
  [string]$Region = 'us-central1'
)

$ErrorActionPreference = 'Stop'

if ($Project -ne 'atlasmap-dev') {
  throw 'Este diagnostico esta bloqueado deliberadamente a atlasmap-dev.'
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontro gcloud en PATH.'
}

$account = (& gcloud config get-value account 2>$null).Trim()
if (-not $account -or $account -eq '(unset)') {
  throw 'gcloud no tiene una cuenta autenticada activa.'
}

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

function Get-FunctionDescription {
  param([string]$FunctionName)
  try {
    $description = Invoke-GcloudJson @(
      'functions', 'describe', $FunctionName,
      '--v2',
      "--region=$Region",
      "--project=$Project"
    )
    return [pscustomobject]@{
      exists = $true
      description = $description
      probeStatus = 'ok'
    }
  } catch {
    $message = [string]$_.Exception.Message
    $status = if ($message -match '(?i)not found|status=\[404\]|\b404\b') { 'not-found' } else { 'unavailable' }
    return [pscustomobject]@{
      exists = $false
      description = $null
      probeStatus = $status
    }
  }
}

function Test-PublicRunInvoker {
  param([string]$ServiceName)
  try {
    $policy = Invoke-GcloudJson @(
      'run', 'services', 'get-iam-policy', $ServiceName,
      "--region=$Region",
      "--project=$Project"
    )
    foreach ($binding in @($policy.bindings)) {
      if ([string]$binding.role -eq 'roles/run.invoker' -and @($binding.members) -contains 'allUsers') {
        return $true
      }
    }
    return $false
  } catch {
    return $null
  }
}

function Invoke-CorsPreflight {
  param([string]$Url)
  $headers = @{
    Origin = 'http://localhost:5173'
    'Access-Control-Request-Method' = 'POST'
    'Access-Control-Request-Headers' = 'content-type,authorization,x-firebase-appcheck,x-firebase-gmpid'
  }
  try {
    $response = Invoke-WebRequest -Uri $Url -Method Options -Headers $headers -UseBasicParsing
    return [pscustomobject]@{
      status = [int]$response.StatusCode
      allowOrigin = [string]$response.Headers['Access-Control-Allow-Origin']
      allowMethods = [string]$response.Headers['Access-Control-Allow-Methods']
    }
  } catch {
    $response = $_.Exception.Response
    $status = $null
    $allowOrigin = $null
    $allowMethods = $null
    if ($response) {
      try { $status = [int]$response.StatusCode } catch {}
      try { $allowOrigin = [string]$response.Headers['Access-Control-Allow-Origin'] } catch {}
      try { $allowMethods = [string]$response.Headers['Access-Control-Allow-Methods'] } catch {}
    }
    return [pscustomobject]@{
      status = $status
      allowOrigin = $allowOrigin
      allowMethods = $allowMethods
    }
  }
}

$functions = @('geoapifyCityAutocomplete', 'storageV4SyncTelemetry')
$results = foreach ($functionName in $functions) {
  $probe = Get-FunctionDescription -FunctionName $functionName
  $description = $probe.description
  $serviceResource = if ($description) { [string]$description.serviceConfig.service } else { $null }
  $serviceName = if ($serviceResource) { ($serviceResource -split '/')[-1] } else { $null }
  $functionUrl = "https://$Region-$Project.cloudfunctions.net/$functionName"
  $preflight = Invoke-CorsPreflight -Url $functionUrl

  [pscustomobject]@{
    function = $functionName
    exists = [bool]$probe.exists
    describeProbeStatus = [string]$probe.probeStatus
    state = if ($description) { [string]$description.state } else { $null }
    ingressSettings = if ($description) { [string]$description.serviceConfig.ingressSettings } else { $null }
    service = $serviceName
    runUri = if ($description) { [string]$description.serviceConfig.uri } else { $null }
    cloudFunctionsUrl = $functionUrl
    publicRunInvoker = if ($serviceName) { Test-PublicRunInvoker -ServiceName $serviceName } else { $null }
    preflightStatus = $preflight.status
    accessControlAllowOrigin = $preflight.allowOrigin
    accessControlAllowMethods = $preflight.allowMethods
  }
}

[ordered]@{
  collectedAtUtc = [DateTime]::UtcNow.ToString('o')
  project = $Project
  region = $Region
  comparison = $results
} | ConvertTo-Json -Depth 8
